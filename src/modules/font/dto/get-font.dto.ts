import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetFontDto {
  @Expose()
  @IsNotEmpty({ message: 'Font ID is required.' })
  id: number;

  @Expose()
  @IsNotEmpty({ message: 'Font name is required.' })
  @IsString({ message: 'Font name must be a string.' })
  name: string;

  @Expose()
  @IsNotEmpty({ message: 'Font family is required.' })
  @IsString({ message: 'Font family must be a string.' })
  family: string;
}
