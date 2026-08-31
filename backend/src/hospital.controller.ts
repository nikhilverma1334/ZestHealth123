import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { TenantGuard } from './auth/tenant.guard';

@Controller('hospital')
export class HospitalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('staff')
  @UseGuards(TenantGuard)
  async getStaff(@Request() req: any) {
    const tenantId = req.tenantId;
    return this.prisma.staffUser.findMany({
      where: { tenantId }
    });
  }
}
