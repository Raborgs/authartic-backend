// src/auth/dto/signup.dto.ts
import { IsString, IsUrl, IsInt,Matches, IsEmail,MinLength, IsArray,MaxLength, IsEnum, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';

export class RegisterDto {

    @IsNotEmpty({ message: 'User name is required.' })
    @IsString({ message: 'User name must be a string.' })
    user_name: string;

    @IsNotEmpty({ message: 'Email is required.' })
    @IsEmail({}, { message: 'Email must be a valid email address.' })
    email: string;

    @IsNotEmpty({ message: 'Password is required.' })
    @IsString({ message: 'Password must be a string.' })
    // @Matches(/(?=.*[a-z])/, { message: 'Password must contain at least one lowercase letter.' }) 
    // @Matches(/(?=.*[A-Z])/, { message: 'Password must contain at least one uppercase letter.' }) 
    // @Matches(/(?=.*[0-9])/, { message: 'Password must contain at least one number.' }) 
    // @Matches(/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, { message: 'Password must contain at least one special character.' }) 
    // @MinLength(8, { message: 'Password must be at least 8 characters long.' }) 
    // @MaxLength(20, { message: 'Password cannot exceed 20 characters.' }) 
    password: string;

    @IsNotEmpty({ message: 'Role is required.' })
    @IsEnum(UserRoleEnum, { message: 'Role must be one of the allowed values.' })
    role: UserRoleEnum;

    @IsNotEmpty({ message: 'Phone number cannot be empty if provided.' })
    @IsString({ message: 'Phone number must be a string.' })
    @Matches(/^[^a-zA-Z]*$/, { message: 'Phone number must not contain any English alphabets.' })
    @MinLength(7, { message: 'Phone number must be at least 7 characters long.' })
    @MaxLength(17, { message: 'Phone number must not exceed 17 characters.' })
    phone: string;

    @IsOptional()
    @IsDateString({}, { message: 'Date of birth must be a valid date string.' })
    date_of_birth?: Date;

    @IsOptional()
    @IsString({ message: 'Primary content must be a string.' })
    primary_content?: string;

    @IsOptional()
    @IsString({ message: 'About brand must be a string.' })
    about_brand?: string;

    @IsOptional()
    @IsString({ message: 'Website URL must be a string.' })
    @IsUrl({}, { message: 'Website URL must be a valid URL.' })
    @MinLength(5, { message: 'Website URL must be at least 5 characters long.' })
    @MaxLength(120, { message: 'Website URL must not exceed 100 characters.' })
    website_url?: string;

    @IsOptional()
    @IsArray({ message: 'Social media links must be an array of URLs.' })
    @IsUrl({}, { each: true, message: 'Each social media link must be a valid URL.' })
    social_media?: string[];

    @IsOptional()
    @IsArray({ message: 'Other links must be an array of URLs.' })
    @IsUrl({}, { each: true, message: 'Each link in other links must be a valid URL.' })
    other_links?: string[];

    @IsNotEmpty({ message: 'Country is required.' })
    @IsInt({ message: 'Country ID must be an integer.' })
    country_id?: number;

    @IsOptional()
    attachment_id?: number;

    @IsOptional()
    validation_code_id?: number;
}
