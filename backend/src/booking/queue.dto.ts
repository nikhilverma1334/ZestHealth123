import { IsUUID, IsNumber, IsOptional, IsEnum } from 'class-validator';

export class UpdateQueueStatusDto {
  @IsUUID()
  appointmentId: string;

  @IsEnum(['IN_QUEUE', 'IN_CONSULTATION', 'COMPLETED', 'NO_SHOW', 'CANCELLED'])
  status: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;
}
