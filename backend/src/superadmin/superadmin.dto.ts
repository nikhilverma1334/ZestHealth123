import { IsString, IsArray, IsPhoneNumber, IsOptional, IsNumber } from 'class-validator';

export class OnboardTenantDto {
  @IsString()
  orgName: string;

  @IsString()
  branchName: string;

  @IsString()
  branchAddress: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  adminName: string;

  @IsPhoneNumber()
  adminPhone: string;
}
