import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../booking/queue.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService
  ) {}

  async getDoctorQueue(doctorId: string, branchId: string, date: Date) {
    return this.prisma.appointment.findMany({
      where: {
        doctorId,
        branchId,
        date,
      },
      orderBy: [
        { priority: 'desc' },
        { tokenNumber: 'asc' }
      ],
      include: {
        patient: { select: { id: true, name: true, phone: true } }
      }
    });
  }

  async emergencyInsert(patientId: string, doctorId: string, branchId: string, tenantId: string, date: Date, timeSlot: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      // Find max token number (even for emergencies, token number is sequential)
      const appointments = await tx.appointment.findMany({
        where: { doctorId, branchId, date, timeSlot },
        orderBy: { tokenNumber: 'desc' },
      });
      const nextTokenNumber = appointments.length > 0 ? appointments[0].tokenNumber + 1 : 1;

      const appointment = await tx.appointment.create({
        data: {
          patientId,
          doctorId,
          branchId,
          tenantId,
          date,
          timeSlot,
          tokenNumber: nextTokenNumber,
          status: 'IN_QUEUE',
          arrivedAt: new Date(),
          priority: 1, // High priority places them at the top of the queue state
          cancellationReason: `EMERGENCY: ${reason}` // Reusing field for audit trail info
        }
      });

      return appointment;
    }).then(async (appt) => {
      // Trigger a queue recalculation so patients are notified of the shift
      await this.queueService.recalculateQueueETAs(doctorId, branchId, date, timeSlot);
      return appt;
    });
  }

  async getAnalytics(tenantId: string, date: Date) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        date
      }
    });

    const totalVolume = appointments.length;
    const noShows = appointments.filter(a => a.status === 'NO_SHOW').length;
    const noShowRate = totalVolume > 0 ? (noShows / totalVolume) * 100 : 0;

    let totalWaitTimeSeconds = 0;
    let waitTimeCount = 0;

    appointments.forEach(a => {
      if (a.arrivedAt && a.consultationStartedAt) {
        const waitTime = (new Date(a.consultationStartedAt).getTime() - new Date(a.arrivedAt).getTime()) / 1000;
        if (waitTime > 0) {
          totalWaitTimeSeconds += waitTime;
          waitTimeCount++;
        }
      }
    });

    const avgWaitTimeSeconds = waitTimeCount > 0 ? totalWaitTimeSeconds / waitTimeCount : 0;

    return {
      date,
      totalVolume,
      noShowRate,
      avgWaitTimeSeconds,
      avgWaitTimeMinutes: Math.round(avgWaitTimeSeconds / 60)
    };
  }
}
