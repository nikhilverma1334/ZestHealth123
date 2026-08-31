import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { QueueGateway } from './queue.gateway';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [BookingController, QueueController],
  providers: [BookingService, QueueGateway, QueueService],
  exports: [QueueService]
})
export class BookingModule {}
