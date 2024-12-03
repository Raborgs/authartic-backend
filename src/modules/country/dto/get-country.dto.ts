import { Expose } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class GetCountryDto {
  @Expose()
  @IsInt({ message: 'ID must be an integer.' })
  @IsNotEmpty({ message: 'ID is required.' })
  id: number;

  @Expose()
  @IsString({ message: 'Country code must be a string.' })
  @IsNotEmpty({ message: 'Country code is required.' })
  code: string;

  @Expose()
  @IsString({ message: 'Country name must be a string.' })
  @IsNotEmpty({ message: 'Country name is required.' })
  name: string;
}
