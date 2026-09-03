import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import cookieParser from 'cookie-parser';

describe('Dual Auth Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let testPatientPhone = '+4444444';
  let testPatientId: string;
  let testStaffEmail = 'dualauth@hospital.com';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);

    // Seed staff user
    const staff = await prisma.staffUser.findFirst({ where: { email: testStaffEmail }});
    if (!staff) {
      await prisma.staffUser.create({
        data: {
          name: 'Dual Auth Staff',
          email: testStaffEmail,
          phone: '+3333333',
          password: 'hashed-password-not-tested-here'
        }
      });
    }
  });

  afterAll(async () => {
    await new Promise(r => setTimeout(r, 1000));
    if (prisma) {
      await prisma.staffUser.deleteMany({ where: { email: testStaffEmail } });
      await prisma.patient.deleteMany({ where: { name: 'Dual Auth Patient' } });
    }
    if (app) await app.close();
  });

  it('Web cookie login sets httpOnly cookies', async () => {
    // In auth.controller.ts, staff login mock is userType = 'STAFF' for verify-otp
    // Let's use verify-otp with STAFF to simulate staff login
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: '+3333333', otp: '1234', userType: 'STAFF' })
      .expect(201);
    
    // Because x-client-type is NOT mobile, it should return cookies
    const cookies = verifyRes.headers['set-cookie'] as string[];
    expect(cookies).toBeDefined();
    
    // Check jwt_token cookie
    const accessCookie = cookies.find((c: string) => c.startsWith('jwt_token='));
    expect(accessCookie).toBeDefined();
    expect(accessCookie).toContain('HttpOnly');
    
    // Body should NOT contain tokens
    expect(verifyRes.body.access_token).toBeUndefined();
  });

  it('Mobile login returns tokens in JSON body', async () => {
    // Generate OTP
    process.env.TEST_ENDPOINTS_SECRET = 'e2e-secret-123';
    await request(app.getHttpServer())
      .post('/auth/generate-otp')
      .send({ phone: testPatientPhone, name: 'Dual Auth Patient' })
      .expect(201);
    
    const otpRes = await request(app.getHttpServer())
      .get(`/auth/mock-otp?phone=${encodeURIComponent(testPatientPhone)}`)
      .set('x-test-secret', 'e2e-secret-123')
      .expect(200);
      
    const realOtp = otpRes.body.otp;

    // Verify OTP WITH mobile header
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .set('x-client-type', 'mobile')
      .send({ phone: testPatientPhone, otp: realOtp, userType: 'PATIENT' })
      .expect(201);
    
    // Should NOT have set-cookie
    expect(verifyRes.headers['set-cookie']).toBeUndefined();
    
    // Body MUST contain tokens
    expect(verifyRes.body.access_token).toBeDefined();
    expect(verifyRes.body.refresh_token).toBeDefined();
    
    // Save for refresh test
    const refreshToken = verifyRes.body.refresh_token;
    
    // Test Refresh rotates both tokens
    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refresh_token: refreshToken })
      .expect(201);
      
    expect(refreshRes.body.access_token).toBeDefined();
    expect(refreshRes.body.refresh_token).toBeDefined();
    expect(refreshRes.body.refresh_token).not.toEqual(refreshToken);
    
    // Replaying the old refresh token must be rejected (401)
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refresh_token: refreshToken })
      .expect(401);
  });
});
