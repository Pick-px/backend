import { IsString, IsNumber, IsOptional, IsInt, Min, Max } from 'class-validator';

export class UpdatePixelDto {
  @IsString()
  color: string;

  @IsInt()
  @Min(0)
  x: number;

  @IsInt()
  @Min(0)
  y: number;

  @IsOptional()
  @IsInt()
  owner?: number | null;
}
