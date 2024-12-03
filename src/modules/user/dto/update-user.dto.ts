import { IsString, IsUrl, IsArray, IsEnum, IsNotEmpty, IsOptional, IsDateString, IsInt } from 'class-validator';

export class UpdateUserDto {
    @IsOptional()
    @IsString({ message: 'User name must be a string.' })
    user_name?: string;

    @IsOptional()
    @IsString({ message: 'Phone number must be a string.' })
    phone?: string;

    @IsOptional()
    @IsDateString({}, { message: 'Date of birth must be a valid date string.' })
    date_of_birth?: string;

    @IsOptional()
    @IsString({ message: 'Primary content must be a string.' })
    primary_content?: string;

    @IsOptional()
    @IsString({ message: 'About brand must be a string.' })
    about_brand?: string;

    @IsOptional()
    @IsUrl({}, { message: 'Website URL must be a valid URL.' })
    website_url?: string;

    @IsOptional()
    @IsArray({ message: 'Social media links must be an array.' })
    @IsUrl({}, { each: true, message: 'Each social media link must be a valid URL.' })
    social_media?: string[];

    @IsOptional()
    @IsArray({ message: 'Other links must be an array.' })
    @IsUrl({}, { each: true, message: 'Each other link must be a valid URL.' })
    other_links?: string[];

    @IsOptional()
    @IsInt({ message: 'Country ID must be an integer.' })
    country_id?: number;

    @IsOptional()
    @IsInt({ message: 'Attachment ID must be an integer.' })
    attachment_id?: number;
    
    @IsOptional()
    @IsInt({ message: 'Validation code ID must be an integer.' })
    validation_code_id?: number;

    @IsOptional()
    @IsInt({ message: 'Subscription plan ID must be an integer.' })
    subscription_plan_id?: number;
}
