import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchDoctorsDto {
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  lat?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  lng?: number;
}
