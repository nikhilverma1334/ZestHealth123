import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('superadmin')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @Post('onboard')
  // @UseGuards(TenantGuard) - We would normally protect this with JWT and TenantGuard checking for PLATFORM_SUPER_ADMIN
  async onboard(@Body() body: any) {
    return this.superadminService.onboardHospital({
      hospitalName: body.orgName,
      branchName: body.branchName,
      branchAddress: body.branchAddress,
      latitude: body.latitude,
      longitude: body.longitude,
      adminName: body.adminName,
      adminPhone: body.adminPhone
    });
  }
}
