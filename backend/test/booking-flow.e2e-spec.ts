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

    // Create Patient via API
    // 1. Generate OTP
    await request(app.getHttpServer()).post('/auth/generate-otp').send({ phone: '+55555', name: 'Flow Patient' }).expect(201);
    
    // 2. Verify OTP
    const verifyRes = await request(app.getHttpServer()).post('/auth/verify-otp').send({ phone: '+55555', otp: '123456', userType: 'PATIENT' }).expect(201);
    
    patientToken = verifyRes.body.access_token;
    
    const dbPatient = await prisma.patient.findFirst({ where: { phone: '+55555' } });
    patientId = dbPatient!.id;
  });

  afterAll(async () => {
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

    // Fetch patient appointments
    const listRes = await request(app.getHttpServer())
      .get('/booking/patient/' + patientId)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].id).toBe(bookRes.body.id);

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
