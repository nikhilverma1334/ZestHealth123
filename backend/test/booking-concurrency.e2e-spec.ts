import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

jest.setTimeout(60000); // 60s for DB setup and 50 concurrent requests

describe('BookingModule (e2e) - Concurrency Stress Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let tenantId: string;
  let branchId: string;
  let doctorId: string;
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

    // 1. Seed Real Database Data
    const org = await prisma.hospitalOrg.create({
      data: { name: 'Concurrency Test Hospital' },
    });
    tenantId = org.id;

    const branch = await prisma.branch.create({
      data: { name: 'Concurrency Branch', hospitalOrgId: org.id },
    });
    branchId = branch.id;

    const doctor = await prisma.staffUser.create({
      data: {
        name: 'Dr. Concurrency',
        phone: `+1000000${Math.floor(Math.random() * 1000)}`,
        passwordHash: 'hash',
        role: 'DOCTOR',
        tenantId: org.id,
        branchId: branch.id,
        doctorProfile: {
          create: { specialties: ['General'], experienceYears: 5, consultationFee: 100 }
        }
      },
    });
    doctorId = doctor.id;

    // Create Doctor Availability with enough capacity
    const testDate = new Date();
    testDate.setUTCHours(0,0,0,0); // Match how date is queried

    await prisma.doctorAvailability.create({
      data: {
        doctorId: doctorId,
        branchId: branchId,
        date: testDate,
        timeSlot: '09:00',
        maxPatients: 60, // accommodate 50 requests
        bookedCount: 0
      }
    });

    for (let i = 0; i < 50; i++) {
      const p = await prisma.patient.create({
        data: { name: `Test Patient ${i}`, phone: `+200000000${i}` }
      });
      patientIds.push(p.id);
    }

    // 2. Generate Real JWT for an admin booking these patients
    token = jwtService.sign({
      sub: doctor.id,
      role: 'BRANCH_RECEPTION',
      tenantId: tenantId,
      branchId: branchId
    });
  });

  afterAll(async () => {
    // Cleanup DB (Delete in reverse dependency order)
    await prisma.appointment.deleteMany({ where: { doctorId } });
    await prisma.doctorAvailability.deleteMany({ where: { doctorId } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.staffUser.deleteMany({ where: { id: doctorId } });
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
          .set('Authorization', `Bearer ${token}`) // Real JWT with tenant/branch context
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

    // Filter out HTTP failures just in case, but we expect all 201s
    const successfulBookings = results.filter(r => r.status === 201).map(r => r.body);
    
    // Test should pass purely (50 successful bookings)
    expect(successfulBookings.length).toBe(50);

    // Extract assigned token numbers
    const tokenNumbers = successfulBookings.map(b => b.tokenNumber).sort((a, b) => a - b);
    
    // 1. Assert perfect sequence without gaps or duplicates
    for (let i = 0; i < tokenNumbers.length; i++) {
      expect(tokenNumbers[i]).toBe(i + 1);
    }
    
    // 2. Assert no duplicates via Set size
    const uniqueTokens = new Set(tokenNumbers);
    expect(uniqueTokens.size).toBe(tokenNumbers.length);
  });
});
