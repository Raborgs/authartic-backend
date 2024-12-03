import { IsNotEmpty, IsString, MaxLength, IsOptional, IsInt } from 'class-validator';

export class UpdateFontDto {
    @IsOptional()
    @IsString({ message: 'Font name must be a string.' })
    @MaxLength(200, { message: 'Font name cannot exceed 50 characters.' })
    name?: string;

    @IsOptional()
    @IsString({ message: 'Font family must be a string.' })
    @MaxLength(300, { message: 'Font family cannot exceed 50 characters.' })
    family?: string;

    @IsOptional()
    @IsInt({ message: 'Status must be an integer.' })
    status?: number;
}
