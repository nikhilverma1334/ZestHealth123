import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendBookingConfirmation(appointmentId: string, patientId: string, phone: string, fcmToken?: string) {
    // 1. Log attempt for Push
    if (fcmToken) {
      await this.logAndSend(appointmentId, 'PUSH', 'BOOKING_CONFIRMATION', async () => {
        // Mock FCM call
        this.logger.log(`Mock FCM Push sent to ${fcmToken} for appt ${appointmentId}`);
      });
    }

    // 2. Log attempt for SMS/WhatsApp
    await this.logAndSend(appointmentId, 'SMS', 'BOOKING_CONFIRMATION', async () => {
      // Mock SMS
      this.logger.log(`Mock SMS sent to ${phone} for appt ${appointmentId}`);
    });

    // 3. Log attempt for IVR Call
    await this.logAndSend(appointmentId, 'IVR', 'BOOKING_CONFIRMATION', async () => {
      // Mock Twilio/Exotel IVR Call
      this.logger.log(`Mock IVR Call initiated to ${phone} for appt ${appointmentId}`);
    });
  }

  async sendCancellationNotification(appointmentId: string, phone: string, fcmToken?: string) {
    if (fcmToken) {
      await this.logAndSend(appointmentId, 'PUSH', 'CANCELLED', async () => {
        this.logger.log(`Mock FCM Push cancellation sent to ${fcmToken} for appt ${appointmentId}`);
      });
    }

    await this.logAndSend(appointmentId, 'SMS', 'CANCELLED', async () => {
      this.logger.log(`Mock SMS cancellation sent to ${phone} for appt ${appointmentId}`);
    });
  }

  private async logAndSend(appointmentId: string, channel: string, type: string, sendAction: () => Promise<void>) {
    // Create PENDING log
    const log = await this.prisma.notificationLog.create({
      data: {
        appointmentId,
        channel,
        type,
        status: 'PENDING'
      }
    });

    try {
      await sendAction();
      // Update to SENT
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() }
      });
    } catch (error) {
      // Update to FAILED
      // In a real app, we would push to a BullMQ retry queue here
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED' }
      });
      this.logger.error(`Failed to send ${type} via ${channel} for appt ${appointmentId}`);
    }
  }
}
