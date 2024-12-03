import {Min, Matches, IsString, MaxLength, MinLength, IsNumber, IsNotEmpty, IsDate, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { Optional } from '@nestjs/common';
import { Transform } from 'class-transformer';

export class CreateCertificateInfoDto {
  
 
  @IsNotEmpty({ message: 'Name is required.' })
  @IsString({ message: 'Name must be a string.' })
  @MinLength(3, { message: 'Name must be at least 3 characters long.' })
  @MaxLength(80, { message: 'Name must not exceed 80 characters.' })
  name: string;

  @IsNotEmpty({ message: 'Description is required.' })
  @IsString({ message: 'Description must be a string.' })
  @MinLength(10, { message: 'Description must be at least 10 characters long.' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters.' })
  description: string;

  @Transform(({ value }) => (value === '' || value === undefined ? 0 : value)) // Convert empty strings or undefined to 0
  @IsNotEmpty({ message: 'Number of certificates is required and cannot be empty.' })
  @IsNumber({}, { message: 'Number of certificates must be a number.' })
  @Min(0, { message: 'Number of certificates must be a positive number or zero.' })
  number_of_certificate: number;

  @IsNotEmpty({ message: 'Font is required.' })
  @IsString({ message: 'Font must be a string.' })
  @MinLength(2, { message: 'Font must be at least 2 characters long.' })
  @MaxLength(150, { message: 'Font must not exceed 150 characters.' })
  font: string;

  @IsNotEmpty({ message: 'Font color is required.' })
  @IsString({ message: 'Font color must be a string.' })
  @MinLength(4, { message: 'Font color must be at least 4 characters long (e.g., "#FFF").' })
  @MaxLength(7, { message: 'Font color must not exceed 7 characters long (e.g., "#FFFFFF").' })
  @Matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, { message: 'Font color must be a valid hex color code.' })
  font_color: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ) ? null : value)
  @IsString({ message: 'Background color must be a string.' })
  @MinLength(4, { message: 'Background color must be at least 4 characters long (e.g., "#FFF").' })
  @MaxLength(7, { message: 'Background color must not exceed 7 characters long (e.g., "#FFFFFF").' })
  @Matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, { message: 'Background color must be a valid hex color code.' })
  bg_color?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ) ? null : value)
  @IsNumber({}, { message: 'Custom background ID must be a number.' })
  custom_bg?: number;

  @IsNotEmpty({ message: 'Product primarily sell is required.' })
  @IsString({ message: 'Product primarily sell must be a string.' })
  @MinLength(6, { message: 'Product primarily sell must be at least 6 characters long.' })
  @MaxLength(1000, { message: 'Product primarily sell must not exceed 1000 characters.' })
  product_sell: string;

  @Optional()
  @Transform(({ value }) => (value === '' || value === undefined ) ? null : value)
  @IsBoolean({ message: 'Saved draft must be a boolean.' })
  saved_draft: boolean;

  @IsNotEmpty({ message: 'Product image is required.' })
  @IsNumber({}, { message: 'Product image ID must be a number.' })
  product_image_id: number;
}
