import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { QueueService } from './queue.service';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('update-status')
  @UseGuards(TenantGuard)
  async updateStatus(@Body() body: any) {
    const { appointmentId, status, lat, lng } = body;
    let location = undefined;
    if (lat && lng) {
      location = { lat: parseFloat(lat), lng: parseFloat(lng) };
    }
    return this.queueService.updateAppointmentStatus(appointmentId, status, location);
  }
}
