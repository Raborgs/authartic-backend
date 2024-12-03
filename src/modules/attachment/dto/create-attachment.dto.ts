import { IsString, IsOptional,IsNotEmpty } from 'class-validator';

export class CreateAttachmentDto {
    @IsNotEmpty({ message: 'File type is required.' })
    @IsString({ message: 'File type must be a string.' })
    type: string;
}
