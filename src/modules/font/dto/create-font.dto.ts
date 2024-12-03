import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateFontDto {
  @IsNotEmpty({ message: 'Font name is required.' })
  @IsString({ message: 'Font name must be a string.' })
  @MaxLength(200, { message: 'Font name cannot exceed 50 characters.' })
  name: string;

  @IsNotEmpty({ message: 'Font family is required.' })
  @IsString({ message: 'Font family must be a string.' })
  @MaxLength(300, { message: 'Font family cannot exceed 50 characters.' })
  family: string;
}
