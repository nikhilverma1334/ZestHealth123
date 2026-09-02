import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('SearchModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  
  let tenant1Id: string;
  let tenant2Id: string;
  let branch1Id: string;
  let branch2Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    prisma = app.get(PrismaService);

    // 1. Setup Keyword Mapping
    await prisma.specialtyMap.create({
      data: { keyword: 'fever', specialty: 'General Physician' }
    });

    // 2. Setup Tenants & Branches
    const org1 = await prisma.hospitalOrg.create({ data: { name: 'Hospital A' } });
    tenant1Id = org1.id;
    const branch1 = await prisma.branch.create({
      data: { name: 'Branch A', hospitalOrgId: org1.id, address: 'Near', latitude: 12.9716, longitude: 77.5946 }
    });
    branch1Id = branch1.id;

    const org2 = await prisma.hospitalOrg.create({ data: { name: 'Hospital B' } });
    tenant2Id = org2.id;
    const branch2 = await prisma.branch.create({
      data: { name: 'Branch B', hospitalOrgId: org2.id, address: 'Far', latitude: 12.9000, longitude: 77.5000 }
    });
    branch2Id = branch2.id;

    // 3. Setup Doctors
    const staff1 = await prisma.staffUser.create({ data: { name: 'Dr. Near', phone: '+111', password: 'hash' } });
    const doc1 = await prisma.doctor.create({ data: { staffUserId: staff1.id, specialties: ['General Physician'], qualifications: ['MD'] } });
    await prisma.doctorBranch.create({ data: { doctorId: doc1.id, branchId: branch1Id } });

    const staff2 = await prisma.staffUser.create({ data: { name: 'Dr. Far', phone: '+222', password: 'hash' } });
    const doc2 = await prisma.doctor.create({ data: { staffUserId: staff2.id, specialties: ['General Physician'], qualifications: ['MBBS'] } });
    await prisma.doctorBranch.create({ data: { doctorId: doc2.id, branchId: branch2Id } });

    const staff3 = await prisma.staffUser.create({ data: { name: 'Dr. Neuro', phone: '+333', password: 'hash' } });
    const doc3 = await prisma.doctor.create({ data: { staffUserId: staff3.id, specialties: ['Neurologist'], qualifications: ['DM'] } });
    await prisma.doctorBranch.create({ data: { doctorId: doc3.id, branchId: branch1Id } });

    // 4. Setup Availability
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Dr. Near (Branch 1, closest to patient) has slot TOMORROW
    await prisma.doctorAvailability.create({
      data: { doctorId: doc1.id, branchId: branch1Id, date: tomorrow, startTime: '10:00', endTime: '11:00', slotDuration: 30, maxPatientsPerSlot: 2 }
    });

    // Dr. Far (Branch 2, further away) has slot TODAY
    await prisma.doctorAvailability.create({
      data: { doctorId: doc2.id, branchId: branch2Id, date: today, startTime: '09:00', endTime: '10:00', slotDuration: 30, maxPatientsPerSlot: 2 }
    });
  });

  afterAll(async () => {
    // Cleanup DB
    await prisma.doctorAvailability.deleteMany({ where: { branchId: { in: [branch1Id, branch2Id] } } });
    await prisma.doctorBranch.deleteMany({ where: { branchId: { in: [branch1Id, branch2Id] } } });
    await prisma.doctor.deleteMany({ where: { staffUser: { phone: { in: ['+111', '+222', '+333'] } } } });
    await prisma.staffUser.deleteMany({ where: { phone: { in: ['+111', '+222', '+333'] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [branch1Id, branch2Id] } } });
    await prisma.hospitalOrg.deleteMany({ where: { id: { in: [tenant1Id, tenant2Id] } } });
    await prisma.specialtyMap.deleteMany({ where: { keyword: 'fever' } });

    await app.close();
  });

  it('/search/doctors (GET) - searches symptom "fever" and returns sorted results', async () => {
    // Search exact coordinates of Branch 1
    const response = await request(app.getHttpServer())
      .get('/search/doctors?q=fever&lat=12.9716&lng=77.5946')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(2); // Should find Dr. Near and Dr. Far, but NOT Dr. Neuro

    // Dr. Far should be FIRST because availability is TODAY, despite being further away
    expect(response.body[0].name).toBe('Dr. Far');
    expect(response.body[1].name).toBe('Dr. Near');
  });
});
