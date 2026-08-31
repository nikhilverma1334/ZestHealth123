import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueGateway } from './queue.gateway';
import { GoogleMapsService } from '../maps/google-maps.service';
import { createClient } from 'redis';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private redisClient;

  // Specialty-based cold-start durations (in seconds)
  private readonly DEFAULT_DURATIONS: Record<string, number> = {
    'General Physician': 10 * 60,
    'Dentist': 20 * 60,
    'Cardiologist': 25 * 60,
    'Psychiatrist': 45 * 60,
    'default': 15 * 60
  };

  private readonly MIN_DURATION = 5 * 60;
  private readonly MAX_DURATION = 60 * 60;
  private readonly LEAVE_NOW_BUFFER_SECONDS = 10 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueGateway: QueueGateway,
    private readonly mapsService: GoogleMapsService
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.error('REDIS_URL environment variable is not set. Terminating.');
      process.exit(1);
    }
    
    const isTls = redisUrl.startsWith('rediss://');
    this.redisClient = createClient({
      url: redisUrl,
      ...(isTls && {
        socket: {
          tls: true,
          // Removed rejectUnauthorized: false to enforce Let's Encrypt CA validation
        }
      })
    });

    this.redisClient.on('connect', () => {
      try {
        const host = new URL(redisUrl).host;
        this.logger.log(`Successfully connected to Redis host: ${host}`);
      } catch (e) {
        this.logger.log('Successfully connected to Redis');
      }
    });

    this.redisClient.on('error', (err) => {
      this.logger.error(`Redis connection error:`, err);
    });

    this.redisClient.connect().catch((err) => {
      this.logger.error('Fatal: Failed to connect to Redis on startup', err);
      process.exit(1);
    });
  }

  async updateAppointmentStatus(appointmentId: string, status: any, patientLocation?: { lat: number, lng: number }) {
    let dataToUpdate: any = { status };
    if (status === 'IN_CONSULTATION') {
      dataToUpdate.consultationStartedAt = new Date();
    }
    if (status === 'IN_QUEUE') {
      dataToUpdate.arrivedAt = new Date();
    }

    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: dataToUpdate,
      include: {
        branch: true,
        doctor: true
      }
    });

    if (status === 'COMPLETED' && appointment.consultationStartedAt) {
      const durationSeconds = Math.floor((new Date().getTime() - new Date(appointment.consultationStartedAt).getTime()) / 1000);
      await this.updateRollingAverage(appointment.doctorId, appointment.branchId, appointment.doctor.specialties, durationSeconds);
    }

    await this.recalculateQueueETAs(appointment.doctorId, appointment.branchId, appointment.date, appointment.timeSlot, patientLocation);
    
    return appointment;
  }

  private async updateRollingAverage(doctorId: string, branchId: string, specialties: string[], latestDurationSeconds: number) {
    const key = `rolling_avg:${branchId}:${doctorId}`;
    let avg = await this.getRollingAverage(doctorId, branchId, specialties);

    // Clamp latest duration
    const clampedLatest = Math.max(this.MIN_DURATION, Math.min(this.MAX_DURATION, latestDurationSeconds));

    // Exponential Moving Average
    // new_avg = old_avg * 0.7 + latest_duration * 0.3
    let newAvg = (avg * 0.7) + (clampedLatest * 0.3);
    newAvg = Math.max(this.MIN_DURATION, Math.min(this.MAX_DURATION, newAvg));

    await this.redisClient.set(key, JSON.stringify({ avg: newAvg }));
  }

  private async getRollingAverage(doctorId: string, branchId: string, specialties: string[]): Promise<number> {
    const key = `rolling_avg:${branchId}:${doctorId}`;
    const data = await this.redisClient.get(key);
    if (data) {
      return JSON.parse(data).avg;
    }
    // Cold start default based on specialty
    const specialty = specialties.length > 0 ? specialties[0] : 'default';
    return this.DEFAULT_DURATIONS[specialty] || this.DEFAULT_DURATIONS['default'];
  }

  async recalculateQueueETAs(doctorId: string, branchId: string, date: Date, timeSlot: string, patientLocation?: { lat: number, lng: number }) {
    const activeAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        branchId,
        date,
        timeSlot,
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] }
      },
      orderBy: [
        { priority: 'desc' },
        { tokenNumber: 'asc' }
      ],
      include: {
        branch: true,
        doctor: true
      }
    });

    if (activeAppointments.length === 0) return;

    // Get doctor specialties from the first active appointment for fallback
    const specialties = activeAppointments[0].doctor.specialties;
    const rollingAvgSeconds = await this.getRollingAverage(doctorId, branchId, specialties);
    
    const inConsultation = activeAppointments.find(a => a.status === 'IN_CONSULTATION');
    let currentlyServingToken = inConsultation ? inConsultation.tokenNumber : activeAppointments[0].tokenNumber;

    let timeRemainingForCurrent = 0;
    if (inConsultation && inConsultation.consultationStartedAt) {
      const elapsed = Math.floor((new Date().getTime() - new Date(inConsultation.consultationStartedAt).getTime()) / 1000);
      timeRemainingForCurrent = Math.max(0, rollingAvgSeconds - elapsed);
    }

    for (let i = 0; i < activeAppointments.length; i++) {
      const apt = activeAppointments[i];
      // Because we fetched them ordered by priority DESC, tokenNumber ASC,
      // the number of patients ahead is simply their index in the array `i`.
      const patientsAhead = i;
      
      let etaSeconds = 0;
      if (apt.status === 'IN_CONSULTATION') {
        etaSeconds = 0;
      } else {
        const othersAheadCount = inConsultation ? patientsAhead - 1 : patientsAhead;
        etaSeconds = timeRemainingForCurrent + (Math.max(0, othersAheadCount) * rollingAvgSeconds);
      }

      let leaveNowTriggered = false;
      let durationText = '';
      
      if (patientLocation && !apt.leaveNowSent && apt.status !== 'IN_CONSULTATION') {
        const dest = [{ lat: apt.branch.latitude || 0, lng: apt.branch.longitude || 0 }];
        const distances = await this.mapsService.getDistances(patientLocation, dest);
        if (distances && distances.length > 0) {
          // Travel time + buffer
          const totalTravelTimeSeconds = distances[0].durationValue + this.LEAVE_NOW_BUFFER_SECONDS;
          durationText = distances[0].durationText;
          
          if (etaSeconds <= totalTravelTimeSeconds) {
            leaveNowTriggered = true;
            // Mark as sent in DB idempotently
            await this.prisma.appointment.update({
              where: { id: apt.id },
              data: { leaveNowSent: true }
            });
          }
        }
      }

      this.queueGateway.notifyPatient(apt.patientId, {
        appointmentId: apt.id,
        tokenNumber: apt.tokenNumber,
        currentlyServingToken,
        patientsAhead,
        status: apt.status,
        etaSeconds,
        leaveNowAlert: leaveNowTriggered || apt.leaveNowSent,
        travelTimeText: durationText
      });
    }
  }
}
