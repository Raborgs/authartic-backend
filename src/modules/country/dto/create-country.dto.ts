import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCountryDto {
  @IsNotEmpty({ message: 'Country name is required.' })
  @IsString({ message: 'Country name must be a string.' })
  name: string;

  @IsNotEmpty({ message: 'Country code is required.' })
  @IsString({ message: 'Country code must be a string.' })
  code: string;
}

