import { IsNumber, IsString } from 'class-validator';

class Overlay {
  @IsString()
  url: string;
  @IsString()
  group_id: string;

  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  height: number;

  @IsNumber()
  width: number;
}
export { Overlay };
