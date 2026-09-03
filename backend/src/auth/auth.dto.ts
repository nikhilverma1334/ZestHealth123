import { IsPhoneNumber, IsEnum, IsString, IsOptional, Length } from 'class-validator';

export class GenerateOtpDto {
  @IsPhoneNumber()
  phone: string;

  @IsEnum(['PATIENT', 'STAFF'])
  @IsOptional()
  userType?: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class VerifyOtpDto {
  @IsPhoneNumber()
  phone: string;

  @IsString()
  @Length(4, 6)
  otp: string;

  @IsEnum(['PATIENT', 'STAFF'])
  userType: string;
}

export class RefreshDto {
  @IsString()
  @IsOptional()
  refresh_token?: string;
}
