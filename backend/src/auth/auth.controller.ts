import { Controller, Post, Body, UnauthorizedException, BadRequestException, Res, Req, Get, Query, Headers } from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('generate-otp')
  async generateOtp(@Body('phone') phone: string, @Body('userType') userType: string) {
    if (!phone) throw new BadRequestException('Phone is required');
    if (userType === 'STAFF') {
      // In reality, hook this up to staff OTP logic
      // For now, mock return
      return { message: 'OTP sent to staff' };
    }
    return this.authService.requestPatientOtp(phone);
  }

  @Get('mock-otp')
  getMockOtp(@Query('phone') phone: string, @Headers('x-test-secret') secret: string) {
    if (process.env.NODE_ENV === 'production' || secret !== process.env.TEST_ENDPOINTS_SECRET) {
      throw new UnauthorizedException('Mock OTP endpoint is disabled or unauthorized');
    }
    return { otp: this.authService.getMockOtpForTest(phone) };
  }

  @Post('verify-otp')
  async verifyOtp(@Body('phone') phone: string, @Body('otp') otp: string, @Body('userType') userType: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!phone || !otp) throw new BadRequestException('Phone and OTP are required');
    
    // We would normally branch on userType, but we'll mock verify returning a token for staff
    let tokens;
    if (userType === 'STAFF') {
      // Mocking Staff Verify - In real app, verify against StaffUser table
      tokens = { access_token: 'mock_staff_jwt', refresh_token: 'mock_staff_refresh' };
    } else {
      tokens = await this.authService.verifyPatientOtp(phone, otp);
    }
    
    const isMobile = req.headers['x-client-type'] === 'mobile';
    
    if (isMobile) {
      return tokens; // send in body
    } else {
      const isProd = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'strict' as const : 'lax' as const,
        domain: isProd ? '.zesthealth.com' : undefined,
      };

      res.cookie('jwt_token', tokens.access_token, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000 // 15 mins
      });

      if ('refresh_token' in tokens) {
        res.cookie('refresh_token', (tokens as any).refresh_token, {
          ...cookieOptions,
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
      }

      return { message: 'Authenticated successfully' };
    }
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body('refresh_token') bodyRefreshToken?: string) {
    const isMobile = req.headers['x-client-type'] === 'mobile';
    const refreshToken = isMobile ? bodyRefreshToken : req.cookies['refresh_token'];
    
    if (!refreshToken) throw new UnauthorizedException('No refresh token provided');

    // Verify and rotate the refresh token
    const newTokens = this.authService.rotateRefreshToken(refreshToken);

    if (!isMobile) {
      const isProd = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict' as const,
        domain: isProd ? '.zesthealth.com' : undefined,
      };

      res.cookie('jwt_token', newTokens.access_token, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
      });
      res.cookie('refresh_token', newTokens.refresh_token, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return { message: 'Tokens refreshed' };
    } else {
      return newTokens;
    }
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict' as const,
      domain: isProd ? '.zesthealth.com' : undefined,
    };
    res.cookie('jwt_token', '', { ...cookieOptions, expires: new Date(0) });
    res.cookie('refresh_token', '', { ...cookieOptions, expires: new Date(0) });
    return { message: 'Logged out' };
  }
}
