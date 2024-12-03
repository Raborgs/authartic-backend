import { Expose, Type } from 'class-transformer';
import { IsNumber, IsString, IsNotEmpty } from 'class-validator';

export class GetAttachmentDto {
  @Expose()
  @IsNotEmpty({ message: 'ID is required.' }) 
  @IsNumber({}, { message: 'ID must be a number.' }) 
  @Type(() => Number)
  id: number;

  @Expose()
  @IsNotEmpty({ message: 'URL is required.' }) 
  @IsString({ message: 'URL must be a string.' }) 
  url: string;

  @Expose()
  @IsNotEmpty({ message: 'File type is required.' }) 
  @IsString({ message: 'File type must be a string.' }) 
  file_type: string;

  @Expose()
  @IsNotEmpty({ message: 'File name is required.' }) 
  @IsString({ message: 'File name must be a string.' }) 
  file_name: string;
}
