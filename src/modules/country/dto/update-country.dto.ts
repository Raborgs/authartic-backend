import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class UpdateCountryDto {
    @IsOptional()
    @IsString({ message: 'Country name must be a string.' })
    name?: string;

    @IsOptional()
    @IsString({ message: 'Country code must be a string.' })
    code?: string;

    @IsOptional()
    @IsBoolean({ message: 'Is deleted flag must be a boolean.' })
    is_deleted?: boolean;

    @IsOptional()
    @IsNumber({}, { message: 'Status must be a number.' })
    status?: number;
}
