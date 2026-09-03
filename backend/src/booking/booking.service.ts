import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueGateway } from './queue.gateway';
import { QueueService } from './queue.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueGateway: QueueGateway,
    private readonly queueService: QueueService,
    private readonly notificationService: NotificationService
  ) {}

  async bookAppointment(patientId: string, doctorId: string, branchId: string, tenantId: string, date: Date, timeSlot: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Lock the DoctorAvailability row for this specific slot to prevent concurrent bookings
      const availability = await tx.$queryRaw<any[]>`
        SELECT * FROM "DoctorAvailability" 
        WHERE "doctorId" = ${doctorId} 
          AND "branchId" = ${branchId} 
          AND "date" = ${date}::date
        FOR UPDATE
      `;

      if (!availability || availability.length === 0) {
        throw new BadRequestException('Availability slot not found');
      }

      const maxPatients = availability[0].maxPatientsPerSlot;

      // 2. Find the current max token number for this slot
      const appointments = await tx.appointment.findMany({
        where: { doctorId, branchId, date, timeSlot },
        orderBy: { tokenNumber: 'desc' },
      });

      const nextTokenNumber = appointments.length > 0 ? appointments[0].tokenNumber + 1 : 1;
      
      // 3. Count ACTIVE appointments to check capacity
      const activeCount = appointments.filter(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').length;

      if (activeCount >= maxPatients) {
        throw new BadRequestException('Slot is fully booked');
      }

      // 4. Create the appointment with immutable token number
      const newAppointment = await tx.appointment.create({
        data: {
          patientId,
          doctorId,
          branchId,
          tenantId,
          date,
          timeSlot,
          tokenNumber: nextTokenNumber,
          status: 'BOOKED'
        },
        include: {
          patient: true
        }
      });

      return newAppointment;
    }, {
      // Free-tier PG concurrency over a network takes ~1.5s per queued lock request.
      // For a concurrency queue depth of 15, we need ~22.5s to clear the queue.
      // Setting 40s to provide ample headroom for network variability.
      timeout: 40000,
      maxWait: 40000
    });

    // Fire side-effects OUTSIDE the transaction.
    // Firing inside the transaction causes FK constraint failures because the 
    // notification worker tries to look up the Appointment ID before the tx commits.
    this.notificationService.sendBookingConfirmation(
      result.id, 
      result.patientId, 
      result.patient.phone
    ).catch(console.error);

    return result;
  }

  async cancelAppointment(appointmentId: string, reason: string) {
    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason,
      },
      include: {
        patient: true
      }
    });

    this.notificationService.sendCancellationNotification(
      updated.id,
      updated.patient.phone
    ).catch(console.error);

    // Explicitly notify the cancelled patient via websocket
    this.queueGateway.notifyPatient(updated.patientId, {
      appointmentId: updated.id,
      tokenNumber: updated.tokenNumber,
      status: 'CANCELLED',
      patientsAhead: 0,
      etaSeconds: 0
    });

    // Notify affected patients and staff about queue update
    await this.queueService.recalculateQueueETAs(updated.doctorId, updated.branchId, updated.date, updated.timeSlot);
    
    return updated;
  }
}
