import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Booking Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  
  let tenantId: string;
  let branchId: string;
  let doctorId: string;
  let patientId: string;
  let patientToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    prisma = app.get(PrismaService);

    // Setup Tenant & Branch
    const org = await prisma.hospitalOrg.create({ data: { name: 'Flow Test Org' } });
    tenantId = org.id;
    const branch = await prisma.branch.create({
      data: { name: 'Flow Branch', hospitalOrgId: org.id, address: 'Test' }
    });
    branchId = branch.id;

    // Setup Doctor
    const staff = await prisma.staffUser.create({ data: { name: 'Dr. Flow', phone: '+444', password: 'hash' } });
    const doc = await prisma.doctor.create({ data: { staffUserId: staff.id, specialties: ['General'], qualifications: ['MD'] } });
    doctorId = doc.id;
    await prisma.doctorBranch.create({ data: { doctorId: doc.id, branchId } });

    // Setup Availability
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    await prisma.doctorAvailability.create({
      data: { doctorId, branchId, date: today, startTime: '09:00', endTime: '10:00', slotDuration: 30, maxPatientsPerSlot: 10 }
    });

    // 1. Generate OTP
    await request(app.getHttpServer()).post('/auth/generate-otp').send({ phone: '+55555', name: 'Flow Patient' }).expect(201);
    
    // Fetch the mock OTP from our test-only endpoint
    const otpRes = await request(app.getHttpServer()).get('/auth/mock-otp?phone=%2B55555').expect(200);
    const realOtp = otpRes.body.otp;
    
    // 2. Verify OTP
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .set('x-client-type', 'mobile')
      .send({ phone: '+55555', otp: realOtp, userType: 'PATIENT' })
      .expect(201);
    
    patientToken = verifyRes.body.access_token;
    
    // Extract patientId from JWT since DB phone is encrypted
    const decodedToken = Buffer.from(patientToken.split('.')[1], 'base64').toString();
    patientId = JSON.parse(decodedToken).sub;
  });

  afterAll(async () => {
    // Wait for any background notification promises to settle before tearing down the DB
    await new Promise(r => setTimeout(r, 1000));
    
    // Cleanup DB
    await prisma.notificationLog.deleteMany({ where: { appointment: { patientId } } });
    await prisma.appointment.deleteMany({ where: { patientId } });
    await prisma.doctorAvailability.deleteMany({ where: { branchId } });
    await prisma.doctorBranch.deleteMany({ where: { branchId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.staffUser.deleteMany({ where: { phone: '+444' } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.hospitalOrg.deleteMany({ where: { id: tenantId } });

    await app.close();
  });

  it('completes an end-to-end booking flow', async () => {
    const today = new Date();
    today.setUTCHours(0,0,0,0);

    // Book appointment
    const bookRes = await request(app.getHttpServer())
      .post('/booking/book')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        doctorId,
        branchId,
        patientId,
        date: today.toISOString(),
        timeSlot: '09:00'
      })
      .expect(201);

    expect(bookRes.body.tokenNumber).toBe(1);
    expect(bookRes.body.status).toBe('BOOKED');

    // Cancel appointment
    const cancelRes = await request(app.getHttpServer())
      .post('/booking/cancel')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('x-tenant-id', tenantId)
      .send({
        appointmentId: bookRes.body.id,
        reason: 'Changed mind'
      })
      .expect(201);

    expect(cancelRes.body.status).toBe('CANCELLED');
    expect(cancelRes.body.cancellationReason).toBe('Changed mind');
  });
});
