import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

jest.setTimeout(30000);

describe('IVR Webhook (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let doctorId: string;
  let branchId: string;
  let patientId: string;
  let appointmentIdCancel: string;
  let appointmentIdConfirm: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    const jwtService = app.get<JwtService>(JwtService);

    // Setup DB objects
    const tenant = await prisma.hospitalOrg.create({ data: { name: 'IVR Tenant' } });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: { name: 'IVR Branch', address: '123 IVR St', hospitalOrgId: tenantId }
    });
    branchId = branch.id;

    const patient = await prisma.patient.create({
      data: { name: 'IVR Patient', phone: `+${Date.now()}` }
    });
    patientId = patient.id;

    const staff = await prisma.staffUser.create({
      data: { name: 'Dr. IVR', phone: `+1${Date.now()}` }
    });
    const staffRole = await prisma.staffRole.create({
      data: { staffUserId: staff.id, role: 'DOCTOR', tenantId }
    });
    const doctor = await prisma.doctor.create({
      data: { staffUserId: staff.id, specialties: ['Cardio'] }
    });
    doctorId = doctor.id;

    // Create Doctor Availability
    await prisma.doctorAvailability.create({
      data: {
        doctorId,
        branchId,
        date: new Date(),
        startTime: '08:00',
        endTime: '17:00',
        slotDuration: 30,
        maxPatientsPerSlot: 10
      }
    });

    // Create 2 appointments
    const aptCancel = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        branchId,
        tenantId,
        date: new Date(),
        timeSlot: '12:00',
        status: 'BOOKED',
        tokenNumber: 1,
        priority: 0
      }
    });
    appointmentIdCancel = aptCancel.id;

    const aptConfirm = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        branchId,
        tenantId,
        date: new Date(),
        timeSlot: '12:00',
        status: 'BOOKED',
        tokenNumber: 2,
        priority: 0
      }
    });
    appointmentIdConfirm = aptConfirm.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.notificationLog.deleteMany({ where: { appointment: { patientId } } });
    await prisma.appointment.deleteMany({ where: { patientId } });
    await prisma.doctorAvailability.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.staffRole.deleteMany({ where: { tenantId } });
    await prisma.staffUser.deleteMany({ where: { name: 'Dr. IVR' } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.hospitalOrg.deleteMany({ where: { id: tenantId } });
    await app.close();
  });

  it('Confirms an appointment on Digits 1', async () => {
    const res = await request(app.getHttpServer())
      .post(`/notification/ivr/webhook?appointmentId=${appointmentIdConfirm}`)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({ Digits: '1', CallSid: 'MOCK_SID', From: '+1234' });

    expect(res.status).toBe(201); // NestJS POST default is 201
    expect(res.text).toContain('confirmed');

    const apt = await prisma.appointment.findUnique({ where: { id: appointmentIdConfirm } });
    expect(apt!.status).toBe('IN_QUEUE');
  });

  it('Cancels an appointment on Digits 2 and triggers queue recalculation', async () => {
    const queueService = app.get(require('../src/booking/queue.service').QueueService);
    const recalcSpy = jest.spyOn(queueService, 'recalculateQueueETAs');

    const res = await request(app.getHttpServer())
      .post(`/notification/ivr/webhook?appointmentId=${appointmentIdCancel}`)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({ Digits: '2', CallSid: 'MOCK_SID', From: '+1234' });

    expect(res.status).toBe(201);
    expect(res.text).toContain('cancelled');

    const apt = await prisma.appointment.findUnique({ where: { id: appointmentIdCancel } });
    expect(apt!.status).toBe('CANCELLED');
    expect(apt!.cancellationReason).toBe('Patient cancelled via IVR');

    expect(recalcSpy).toHaveBeenCalled();
    recalcSpy.mockRestore();
  });
});
