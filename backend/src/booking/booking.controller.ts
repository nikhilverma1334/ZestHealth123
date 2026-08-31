import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { BookingService } from './booking.service';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('book')
  @UseGuards(TenantGuard)
  async book(@Request() req: any, @Body() body: any) {
    const { doctorId, branchId, date, timeSlot } = body;
    // Patient ID should come from JWT (req.user.sub) if booked by patient
    // If booked by staff for walk-in, they provide patientId
    const patientId = req.user.role === 'PATIENT' ? req.user.sub : body.patientId;
    
    return this.bookingService.bookAppointment(
      patientId,
      doctorId,
      branchId,
      req.tenantId, // extracted correctly by TenantGuard
      new Date(date),
      timeSlot
    );
  }

  @Post('cancel')
  @UseGuards(TenantGuard)
  async cancel(@Body() body: any) {
    return this.bookingService.cancelAppointment(body.appointmentId, body.reason);
  }
}
