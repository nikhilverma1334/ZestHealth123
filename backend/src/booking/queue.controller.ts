import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { QueueService } from './queue.service';
import { TenantGuard } from '../auth/tenant.guard';
import { UpdateQueueStatusDto } from './queue.dto';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('update-status')
  @UseGuards(TenantGuard)
  async updateStatus(@Body() body: UpdateQueueStatusDto) {
    const { appointmentId, status, lat, lng } = body;
    let location = undefined;
    if (lat && lng) {
      location = { lat: parseFloat(lat as any), lng: parseFloat(lng as any) };
    }
    return this.queueService.updateAppointmentStatus(appointmentId, status, location);
  }
}
