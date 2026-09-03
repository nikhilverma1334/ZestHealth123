import { Controller, Post, Body } from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { OnboardTenantDto } from './superadmin.dto';

@Controller('superadmin')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @Post('onboard')
  // @UseGuards(TenantGuard) - We would normally protect this with JWT and TenantGuard checking for PLATFORM_SUPER_ADMIN
  async onboard(@Body() body: OnboardTenantDto) {
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
