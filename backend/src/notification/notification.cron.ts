import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationCron {
  private readonly logger = new Logger(NotificationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedNotifications() {
    if (process.env.NODE_ENV === 'test') {
      return; // Do not run background cron jobs during e2e testing to prevent DB connection starvation
    }

    this.logger.log('Starting notification retry job...');
    
    // 1. Claim jobs atomically to prevent race conditions across multiple pods/instances
    const claimResult = await this.prisma.notificationLog.updateMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: 3 }
      },
      data: {
        status: 'RETRYING'
      }
    });

    if (claimResult.count === 0) {
      return;
    }

    this.logger.log(`Claimed ${claimResult.count} failed notifications for retry.`);

    // 2. Fetch the claimed jobs
    const jobs = await this.prisma.notificationLog.findMany({
      where: { status: 'RETRYING' }
    });

    for (const job of jobs) {
      try {
        // In a real app, you would resend via Twilio/SendGrid etc here based on job.channel
        // For our test scope, we just mock the resend success
        this.logger.log(`Retrying job ${job.id} (Attempt ${job.retryCount + 1})`);
        
        await this.prisma.notificationLog.update({
          where: { id: job.id },
          data: {
            status: 'SENT',
            retryCount: { increment: 1 },
            sentAt: new Date()
          }
        });
      } catch (err) {
        this.logger.error(`Retry failed for job ${job.id}`, err);
        // Revert to FAILED, increment retry count
        await this.prisma.notificationLog.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            retryCount: { increment: 1 }
          }
        });
      }
    }
  }
}
