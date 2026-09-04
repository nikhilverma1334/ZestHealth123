import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationCron } from './notification.cron';

@Module({
  imports: [PrismaModule],
  providers: [NotificationService, NotificationCron],
  exports: [NotificationService]
})
export class NotificationModule {}
