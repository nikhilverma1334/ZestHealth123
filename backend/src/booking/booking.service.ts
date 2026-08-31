import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueGateway } from './queue.gateway';

import { NotificationService } from '../notification/notification.service';

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueGateway: QueueGateway,
    private readonly notificationService: NotificationService
  ) {}

  async bookAppointment(patientId: string, doctorId: string, branchId: string, tenantId: string, date: Date, timeSlot: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the DoctorAvailability row for this specific slot to prevent concurrent bookings
      const availability = await tx.$queryRaw<any[]>`
        SELECT * FROM "DoctorAvailability" 
        WHERE "doctorId" = ${doctorId} 
          AND "branchId" = ${branchId} 
          AND "date" = ${date}::date
        FOR UPDATE
      `;

      if (!availability || availability.length === 0) {
        // Fallback if the raw query fails or slot doesn't exist
        // For tests, we might not seed it perfectly, so let's allow it but still lock via an advisory lock or similar if needed.
        // For now, if no row, throw error.
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

      // (We would dispatch to a queue here instead of awaiting in tx in prod)
      this.notificationService.sendBookingConfirmation(
        newAppointment.id, 
        newAppointment.patientId, 
        newAppointment.patient.phone
      ).catch(console.error);

      return newAppointment;
    });
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

    // Notify affected patients about queue update
    await this.recalculateAndPushQueue(updated.doctorId, updated.branchId, updated.date, updated.timeSlot);
    
    return updated;
  }

  async recalculateAndPushQueue(doctorId: string, branchId: string, date: Date, timeSlot: string) {
    const activeAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        branchId,
        date,
        timeSlot,
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] }
      },
      orderBy: { tokenNumber: 'asc' }
    });

    // For each patient, compute "patients ahead" and push update
    for (const apt of activeAppointments) {
      const patientsAhead = activeAppointments.filter(a => a.tokenNumber < apt.tokenNumber).length;
      
      this.queueGateway.notifyPatient(apt.patientId, {
        appointmentId: apt.id,
        tokenNumber: apt.tokenNumber,
        patientsAhead,
        status: apt.status
      });
    }
  }
}
