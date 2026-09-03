import { IsUUID, IsString, IsNotEmpty, IsISO8601 } from 'class-validator';

export class EmergencyInsertDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  doctorId: string;

  @IsUUID()
  branchId: string;

  @IsISO8601()
  date: string;

  @IsString()
  timeSlot: string;

  @IsNotEmpty({ message: 'Emergency insertion requires an audit reason.' })
  @IsString({ message: 'Emergency insertion requires an audit reason.' })
  reason: string;
}
