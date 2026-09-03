import { IsUUID, IsString, IsOptional, Matches, IsISO8601 } from 'class-validator';

export class BookAppointmentDto {
  @IsUUID()
  doctorId: string;

  @IsUUID()
  branchId: string;

  @IsISO8601()
  date: string;

  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'timeSlot must be in HH:mm format' })
  timeSlot: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsUUID()
  @IsOptional()
  patientId?: string;
}

export class CancelAppointmentDto {
  @IsUUID()
  appointmentId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
