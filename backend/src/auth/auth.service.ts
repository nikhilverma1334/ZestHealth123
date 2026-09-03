import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  // Simulating Redis for OTP storage for simplicity in Phase 1
  private otpStore = new Map<string, string>();
  private devPlaintextOtpStore = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  getMockOtpForTest(phone: string) {
    if (process.env.NODE_ENV === 'production') return null;
    return this.devPlaintextOtpStore.get(phone) || null;
  }

  async requestPatientOtp(phone: string) {
    // Generate a 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Hash it before storing (Rule: OTPs must be hashed)
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);
    
    this.otpStore.set(phone, hashedOtp);

    if (process.env.NODE_ENV !== 'production') {
      this.devPlaintextOtpStore.set(phone, otp);
    }

    // MOCK SMS PROVIDER: log the plaintext OTP so we can test
    console.log(`[MOCK SMS] OTP for ${phone} is ${otp}`);
    return { message: 'OTP sent successfully' };
  }

  async verifyPatientOtp(phone: string, otp: string) {
    const hashedOtp = this.otpStore.get(phone);
    if (!hashedOtp) {
      throw new UnauthorizedException('OTP expired or not requested');
    }

    const isValid = await bcrypt.compare(otp, hashedOtp);
    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // OTP is valid, clear it
    this.otpStore.delete(phone);

    // Find or create patient
    // Using extendedClient to handle automatic PII encryption/decryption
    let patient = await this.prisma.extendedClient.patient.findUnique({ where: { phone } });
    
    if (!patient) {
      patient = await this.prisma.extendedClient.patient.create({
        data: {
          phone,
          name: 'New Patient', // They can update later
        }
      });
    }

    // Generate JWT
    const payload = { sub: patient.id, role: 'PATIENT' };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async staffLogin(email: string, pass: string) {
    const staff = await this.prisma.staffUser.findFirst({ 
      where: { email },
      include: { roles: true }
    });
    if (!staff || staff.password !== pass) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const roles = staff.roles.map(r => ({ tenantId: r.tenantId, branchId: r.branchId, role: r.role }));
    const payload = { sub: staff.id, roles };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
