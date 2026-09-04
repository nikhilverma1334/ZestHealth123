import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { QueueGateway } from './queue.gateway';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { NotificationModule } from '../notification/notification.module';
import { IvrWebhookController } from './ivr-webhook.controller';

@Module({
  imports: [NotificationModule],
  controllers: [BookingController, QueueController, IvrWebhookController],
  providers: [BookingService, QueueGateway, QueueService],
  exports: [QueueService]
})
export class BookingModule {}
