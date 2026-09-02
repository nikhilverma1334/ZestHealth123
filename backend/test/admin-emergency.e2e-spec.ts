import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

jest.setTimeout(30000);

describe('AdminModule - Emergency Insert (e2e)', () => {
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
      data: { name: 'Emergency Test Hospital' },
    });
    tenantId = org.id;

    const branch = await prisma.branch.create({
      data: { 
        name: 'Emergency Branch', 
        hospitalOrgId: org.id,
        address: '123 Rescue St',
      },
    });
    branchId = branch.id;

    const staffUser = await prisma.staffUser.create({
      data: {
        name: 'Admin User',
        phone: '+1500000000',
        password: 'hash',
      },
    });
    staffUserId = staffUser.id; 

    const doctor = await prisma.doctor.create({
      data: {
        staffUserId: staffUser.id,
        specialties: ['ER'],
        qualifications: ['MD'],
      }
    });
    doctorId = doctor.id;

    await prisma.staffRole.create({
      data: {
        staffUserId: staffUser.id,
        tenantId: org.id,
        branchId: branch.id,
        role: 'HOSPITAL_ADMIN'
      }
    });

    const testDate = new Date();
    testDate.setUTCHours(0,0,0,0); 

    await prisma.doctorAvailability.create({
      data: {
        doctorId: doctorId,
        branchId: branchId,
        date: testDate,
        startTime: '10:00',
        endTime: '11:00',
        slotDuration: 60,
        maxPatientsPerSlot: 1, // Only 1 patient allowed normally!
      }
    });

    const runId = Date.now().toString().slice(-6);
    for (let i = 0; i < 2; i++) {
      const p = await prisma.patient.create({
        data: { name: 'ER Patient ' + i, phone: '+3' + runId + '000' + i }
      });
      patientIds.push(p.id);
    }

    // 2. Generate Real JWT for Admin
    token = jwtService.sign({
      sub: staffUser.id,
      roles: [{
        role: 'HOSPITAL_ADMIN',
        tenantId: tenantId,
        branchId: branchId
      }]
    });
  });

  afterAll(async () => {
    // Cleanup DB
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

  it('rejects POST /admin/emergency-insert if reason is omitted', async () => {
    const testDate = new Date();
    testDate.setUTCHours(0,0,0,0);
    
    const res = await request(app.getHttpServer())
      .post('/admin/emergency-insert')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        patientId: patientIds[0],
        doctorId: doctorId,
        branchId: branchId,
        date: testDate.toISOString(),
        timeSlot: '10:00'
        // notice reason is omitted
      });
      
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Emergency insertion requires an audit reason.');
  });
  
  it('allows emergency insertion even when slot is fully booked', async () => {
    const testDate = new Date();
    testDate.setUTCHours(0,0,0,0);
    
    // 1. Book the ONLY available normal slot
    const bookRes = await request(app.getHttpServer())
      .post('/booking/book')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        doctorId: doctorId,
        branchId: branchId,
        patientId: patientIds[0],
        date: testDate.toISOString(),
        timeSlot: '10:00',
      });
      
    expect(bookRes.status).toBe(201);
    
    // 2. Try to book another normal slot, should fail
    const bookFailRes = await request(app.getHttpServer())
      .post('/booking/book')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        doctorId: doctorId,
        branchId: branchId,
        patientId: patientIds[1],
        date: testDate.toISOString(),
        timeSlot: '10:00',
      });
      
    expect(bookFailRes.status).toBe(400);
    expect(bookFailRes.body.message).toContain('Slot is fully booked');
    
    // 3. Emergency Insert should SUCCEED and bypass the limit
    const emergencyRes = await request(app.getHttpServer())
      .post('/admin/emergency-insert')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId)
      .send({
        patientId: patientIds[1],
        doctorId: doctorId,
        branchId: branchId,
        date: testDate.toISOString(),
        timeSlot: '10:00',
        reason: 'Gunshot wound'
      });
      
    expect(emergencyRes.status).toBe(201);
    expect(emergencyRes.body.cancellationReason).toBe('EMERGENCY: Gunshot wound');
    expect(emergencyRes.body.priority).toBe(1);
    expect(emergencyRes.body.tokenNumber).toBe(2);
  });
});
