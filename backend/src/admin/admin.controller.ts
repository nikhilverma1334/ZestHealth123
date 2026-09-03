import { Controller, Get, Post, Body, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { TenantGuard } from '../auth/tenant.guard';
import { EmergencyInsertDto } from './admin.dto';

@Controller('admin')
@UseGuards(TenantGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('queue')
  async getDoctorQueue(
    @Query('doctorId') doctorId: string,
    @Query('branchId') branchId: string,
    @Query('date') date: string
  ) {
    return this.adminService.getDoctorQueue(doctorId, branchId, new Date(date));
  }

  @Post('emergency-insert')
  async emergencyInsert(@Request() req: any, @Body() body: EmergencyInsertDto) {
    const { patientId, doctorId, branchId, date, timeSlot, reason } = body;
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Emergency insertion requires an audit reason.');
    }
    return this.adminService.emergencyInsert(
      patientId, doctorId, branchId, req.tenantId, new Date(date), timeSlot, reason
    );
  }

  @Get('analytics')
  async getAnalytics(
    @Request() req: any,
    @Query('date') date: string
  ) {
    return this.adminService.getAnalytics(req.tenantId, new Date(date));
  }
}
