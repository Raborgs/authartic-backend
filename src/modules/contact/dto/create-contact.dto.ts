import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ContactDto {
  @IsNotEmpty({ message: 'Name is required.' })
  @IsString({ message: 'Name must be a string.' })
  name: string;

  @IsNotEmpty({ message: 'Email is required.' })
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  email: string;

  @IsNotEmpty({ message: 'Subject is required.' })
  @IsString({ message: 'Subject must be a string.' })
  @MinLength(3, { message: 'Subject must be at least 3 characters long.' }) 
  @MaxLength(150, { message: 'Subject cannot exceed 100 characters.' }) 
  subject: string;

  @IsNotEmpty({ message: 'Message is required.' })
  @IsString({ message: 'Message must be a string.' })
  @MinLength(10, { message: 'Message must be at least 10 characters long.' }) 
  @MaxLength(1000, { message: 'Message cannot exceed 1000 characters.' }) 
  message: string;
}
