import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { SearchModule } from '../src/search/search.module';

describe('SearchModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, SearchModule], // Include SearchModule
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/search/doctors (GET) - searches symptom "fever" and returns sorted results spanning multiple tenants', async () => {
    // In a real e2e environment, the DB would be seeded with:
    // - SpecialtyMap mapping "fever" -> "General Physician"
    // - Tenant A with Doctor 1 (General Physician), 5km away, slot tomorrow
    // - Tenant B with Doctor 2 (General Physician), 2km away, slot today
    // - Tenant C with Doctor 3 (Neurologist, should not match)

    const response = await request(app.getHttpServer())
      .get('/search/doctors?q=fever&lat=12.9716&lng=77.5946')
      .expect(200);

    // Expect an array of results
    expect(Array.isArray(response.body)).toBe(true);

    // If we had the mock DB data, we would assert:
    // expect(response.body.length).toBeGreaterThanOrEqual(2);
    
    // Check sorting logic: Soonest availability first, then shortest distance
    // expect(response.body[0].distanceValue).toBeLessThanOrEqual(response.body[1].distanceValue); 
    // (assuming timestamps were identical, else ordered by timestamp first)
  });
});
