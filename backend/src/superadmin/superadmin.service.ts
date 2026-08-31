import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuperadminService {
  constructor(private readonly prisma: PrismaService) {}

  async onboardHospital(data: {
    hospitalName: string;
    branchName: string;
    branchAddress: string;
    latitude?: number;
    longitude?: number;
    adminName: string;
    adminPhone: string;
  }) {
    // We use a transaction to ensure everything is created together
    return this.prisma.$transaction(async (tx) => {
      // 1. Create HospitalOrg
      const hospital = await tx.hospitalOrg.create({
        data: {
          name: data.hospitalName,
        },
      });

      // 2. Create Branch
      const branch = await tx.branch.create({
        data: {
          hospitalOrgId: hospital.id,
          name: data.branchName,
          address: data.branchAddress,
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
        },
      });

      // 3. Create Admin User
      const admin = await tx.staffUser.create({
        data: {
          name: data.adminName,
          phone: data.adminPhone,
          roles: {
            create: {
              tenantId: hospital.id,
              role: 'HOSPITAL_ADMIN'
            }
          }
        },
      });

      return { hospital, branch, admin };
    });
  }
}
