const fs = require('fs');

const content = import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

jest.setTimeout(60000);

describe('BookingModule (e2e) - Concurrency Stress Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let tenantId: string;
  let branchId: string;
  let doctorId: string;
  let staffUserId: string;
  let patientIds: string[] = [];
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const org = await prisma.hospitalOrg.create({
      data: { name: 'Concurrency Test Hospital' },
    });
    tenantId = org.id;

    const branch = await prisma.branch.create({
      data: { 
        name: 'Concurrency Branch', 
        hospitalOrgId: org.id,
        address: '123 Test Street, Test City',
      },
    });
    branchId = branch.id;

    const staffUser = await prisma.staffUser.create({
      data: {
        name: 'Dr. Concurrency',
        phone: '+1000000999',
        password: 'hash',
      },
    });
    staffUserId = staffUser.id; 

    const doctor = await prisma.doctor.create({
      data: {
        staffUserId: staffUser.id,
        specialties: ['General'],
        qualifications: ['MBBS'],
      }
    });
    doctorId = doctor.id;

    await prisma.staffRole.create({
      data: {
        staffUserId: staffUser.id,
        tenantId: org.id,
        branchId: branch.id,
        role: 'BRANCH_RECEPTION'
      }
    });

    const testDate = new Date();
    testDate.setUTCHours(0,0,0,0); 

    await prisma.doctorAvailability.create({
      data: {
        doctorId: doctorId,
        branchId: branchId,
        date: testDate,
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        maxPatientsPerSlot: 60,
      }
    });

    for (let i = 0; i < 50; i++) {
      const p = await prisma.patient.create({
        data: { name: 'Test Patient ' + i, phone: '+200000000' + i }
      });
      patientIds.push(p.id);
    }

    token = jwtService.sign({
      sub: staffUser.id,
      role: 'BRANCH_RECEPTION',
      tenantId: tenantId,
      branchId: branchId
    });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { branchId } });
    await prisma.doctorAvailability.deleteMany({ where: { branchId } });
    await prisma.doctorBranch.deleteMany({ where: { branchId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.staffRole.deleteMany({ where: { branchId } });
    await prisma.staffUser.deleteMany({ where: { id: staffUserId } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.hospitalOrg.deleteMany({ where: { id: tenantId } });

    await app.close();
  });

  it('assigns perfect sequential token numbers with no duplicates under concurrent load', async () => {
    const promises = [];
    const testDate = new Date();
    testDate.setUTCHours(0,0,0,0);

    for (let i = 0; i < 50; i++) {
      promises.push(
        request(app.getHttpServer())
          .post('/booking/book')
          .set('Authorization', 'Bearer ' + token)
          .send({
            doctorId: doctorId,
            branchId: branchId,
            patientId: patientIds[i],
            date: testDate.toISOString(),
            timeSlot: '09:00',
          })
      );
    }

    const results = await Promise.all(promises);

    const successfulBookings = results.filter(r => r.status === 201).map(r => r.body);
    
    expect(successfulBookings.length).toBe(50);

    const tokenNumbers = successfulBookings.map(b => b.tokenNumber).sort((a, b) => a - b);
    
    for (let i = 0; i < tokenNumbers.length; i++) {
      expect(tokenNumbers[i]).toBe(i + 1);
    }
    
    const uniqueTokens = new Set(tokenNumbers);
    expect(uniqueTokens.size).toBe(tokenNumbers.length);
  });
});;

fs.writeFileSync('test/booking-concurrency.e2e-spec.ts', content);
