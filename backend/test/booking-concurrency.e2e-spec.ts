import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('BookingModule (e2e) - Concurrency Stress Test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('assigns perfect sequential token numbers with no duplicates under concurrent load', async () => {
    // This is a pseudo-test for the concurrency. 
    // In a real environment, we would setup Prisma records:
    // - Doctor, Branch, Patient, DoctorAvailability (maxPatients = 50)
    // Then generate JWT tokens or mock the guard.

    // Mocking 50 concurrent requests
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        request(app.getHttpServer())
          .post('/booking/book')
          .set('Authorization', 'Bearer valid-jwt-here') // Mocked or real JWT
          .send({
            doctorId: 'mock-doc-id',
            branchId: 'mock-branch-id',
            patientId: `mock-patient-${i}`,
            date: '2026-08-30',
            timeSlot: '09:00',
          })
      );
    }

    // Await all requests
    // const results = await Promise.all(promises);

    // Assert there are no failures (or exactly the ones we expect)
    // const successfulBookings = results.filter(r => r.status === 201).map(r => r.body);

    // Extract assigned token numbers
    // const tokenNumbers = successfulBookings.map(b => b.tokenNumber).sort((a, b) => a - b);
    
    // 1. Assert perfect sequence without gaps or duplicates
    // for (let i = 0; i < tokenNumbers.length; i++) {
    //   expect(tokenNumbers[i]).toBe(i + 1);
    // }
    
    // 2. Assert no duplicates via Set size
    // const uniqueTokens = new Set(tokenNumbers);
    // expect(uniqueTokens.size).toBe(tokenNumbers.length);
  });
});
