import { Controller, Post, Req, Body, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { BookingService } from './booking.service';
import { QueueService } from './queue.service';
import * as twilio from 'twilio';

@Controller('notification')
export class IvrWebhookController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly queueService: QueueService
  ) {}

  @Post('ivr/webhook')
  async ivrWebhook(@Req() req: Request, @Body() body: any) {
    // 1. Signature Validation
    if (process.env.NODE_ENV !== 'test') {
      const twilioSignature = req.headers['x-twilio-signature'] as string;
      if (!twilioSignature) {
        throw new UnauthorizedException('Missing Twilio signature');
      }

      const authToken = process.env.TWILIO_AUTH_TOKEN || 'dummy_auth_token';
      
      // The full URL that Twilio requested
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const url = `${protocol}://${host}${req.originalUrl}`;

      const isValid = twilio.validateRequest(authToken, twilioSignature, url, body);
      if (!isValid) {
        throw new ForbiddenException('Invalid Twilio signature');
      }
    }

    // 2. Extract Data
    const appointmentId = req.query.appointmentId as string;
    if (!appointmentId) {
      throw new BadRequestException('appointmentId query parameter is required');
    }

    const { Digits } = body;

    // 3. Process the response
    if (Digits === '1') {
      // CONFIRM
      const apt = await this.queueService.updateAppointmentStatus(appointmentId, 'IN_QUEUE');
      return `<Response><Say>Thank you, your appointment is confirmed.</Say></Response>`;
    } else if (Digits === '2') {
      // CANCEL
      await this.bookingService.cancelAppointment(appointmentId, 'Patient cancelled via IVR');
      return `<Response><Say>Your appointment has been cancelled.</Say></Response>`;
    } else {
      // INVALID
      return `<Response><Say>Invalid selection. Goodbye.</Say></Response>`;
    }
  }
}
