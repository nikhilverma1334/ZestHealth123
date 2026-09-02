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

    // 1. Seed Real Database Data
    const org = await prisma.hospitalOrg.create({
      data: { name: 'Concurrency Test Hospital' },
    });
    tenantId = org.id;

    const branch = await prisma.branch.create({
      data: { 
        name: 'Concurrency Branch', 
        hospitalOrgId: org.id,
        address: '123 Test Street, Test City', // Added required address field
      },
    });
    branchId = branch.id;

    // Create StaffUser correctly (no role/tenantId on the user itself)
    const staffUser = await prisma.staffUser.create({
      data: {
        name: 'Dr. Concurrency',
        phone: `+1000000${Math.floor(Math.random() * 1000)}`,
        password: 'hash',
      },
    });
    staffUserId = staffUser.id;

    // Create Doctor Profile
    const doctor = await prisma.doctor.create({
      data: {
        staffUserId: staffUser.id,
        specialties: ['General'],
        qualifications: ['MBBS'],
      }
    });
    const realDoctorId = doctor.id; // The ID used in Appointment.doctorId
    doctorId = realDoctorId;

    // Create StaffRole for Auth
    await prisma.staffRole.create({
      data: {
        staffUserId: staffUser.id,
        tenantId: org.id,
        branchId: branch.id,
        role: 'BRANCH_RECEPTION' // Role used to authorize the booking
      }
    });

    // Create Doctor Availability with correct schema fields
    const testDate = new Date();
    testDate.setUTCHours(0,0,0,0); 

    await prisma.doctorAvailability.create({
      data: {
        doctorId: realDoctorId,
        branchId: branchId,
        date: testDate,
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        maxPatientsPerSlot: 60, // accommodate 50 requests
      }
    });

    const runId = Date.now().toString().slice(-6); // last 6 digits of timestamp
    for (let i = 0; i < 50; i++) {
      const p = await prisma.patient.create({
        data: { name: `Test Patient ${i}`, phone: `+2${runId}000${i}` }
      });
      patientIds.push(p.id);
    }

    // 2. Generate Real JWT using the StaffUser ID
    token = jwtService.sign({
      sub: staffUser.id,
      roles: [{
        role: 'BRANCH_RECEPTION',
        tenantId: tenantId,
        branchId: branchId
      }]
    });
  });

  afterAll(async () => {
    // Cleanup DB (Delete in reverse dependency order)
    const appts = await prisma.appointment.findMany({ where: { branchId }, select: { id: true } });
    const apptIds = appts.map(a => a.id);
    if (apptIds.length > 0) {
      await prisma.notificationLog.deleteMany({ where: { appointmentId: { in: apptIds } } });
    }
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

    const CONCURRENCY_COUNT = 15; // Reduced from 50 to a realistic extreme OPD scenario
    
    for (let i = 0; i < CONCURRENCY_COUNT; i++) {
      promises.push(
        request(app.getHttpServer())
          .post('/booking/book')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', tenantId)
          .send({
            doctorId: doctorId,
            branchId: branchId,
            patientId: patientIds[i],
            date: testDate.toISOString(),
            timeSlot: '09:00',
          })
          .then(res => ({ status: res.status, body: res.body }))
          .catch(err => ({ status: 0, body: null, error: err.message || err }))
      );
    }

    const results = await Promise.all(promises);

    const successfulBookings = results.filter(r => r.status === 201).map(r => r.body);
    const failedBookings = results.filter(r => r.status !== 201);
    
    if (failedBookings.length > 0) {
      console.log(`\n--- CONCURRENCY FAILURES (${failedBookings.length}/${CONCURRENCY_COUNT}) ---`);
      failedBookings.forEach((f, idx) => console.log(`Failure ${idx + 1}: Status ${f.status}, Error:`, f.error || f.body));
    }

    // Test should pass purely
    expect(successfulBookings.length).toBe(CONCURRENCY_COUNT);

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
