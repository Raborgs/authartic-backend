import { plainToInstance } from 'class-transformer';
import { GetAttachmentDto } from './dto/get-attachment.dto'; 
import { Injectable, NotFoundException } from '@nestjs/common';
import { Attachment } from './entities/attachment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DigitalOceanSpacesService } from 'src/s3/s3.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';

@Injectable()
export class AttachmentService {
  private readonly bucketName: string = process.env.DO_SPACES_BUCKET || 'authartic-bucket';

  constructor(
    @InjectRepository(Attachment)
    private attachmentRepository: Repository<Attachment>,
    private digitalOceanSpacesService: DigitalOceanSpacesService,
    private configService: ConfigService
  ) { }

  async saveAttachment(attachment: Attachment): Promise<Attachment> {
    return this.attachmentRepository.save(attachment);
  }

  async create(file: Express.Multer.File, dto:CreateAttachmentDto): Promise<GetAttachmentDto> {
    const key = `${dto.type}/${Date.now()}_${file.originalname}`;

    const uploadResult = await this.digitalOceanSpacesService.uploadFile(
      this.bucketName,
      key,
      file.buffer,
      file.mimetype,
    );

    const attachment = this.attachmentRepository.create({
      file_name:file.originalname,
      path: uploadResult.Key,
      mimeType: file.mimetype,
      size: file.size,
      url: `${uploadResult.Location}`,
      file_type: dto.type,
      status: 1,
      is_deleted: false,
    });

    const savedAttachemnt = await this.attachmentRepository.save(attachment);

    return plainToInstance(GetAttachmentDto, savedAttachemnt, { excludeExtraneousValues: true });

  }

  async findAll(): Promise<Attachment[]> {
    return this.attachmentRepository.find();
  }

  async getAttachmentByCompanyID(id: number): Promise<GetAttachmentDto> {
    const attachment = this.attachmentRepository.findOne({ where: { id, is_deleted: false } });

    if (!attachment) {
      throw new NotFoundException('File not found');
    }

    const isAttachemnt = await this.attachmentRepository.findOne({ where: { id, is_deleted: false } });
    return plainToInstance(GetAttachmentDto, isAttachemnt, { excludeExtraneousValues: true });
  }

  async remove(id: number): Promise<{ message: string }> {
    const attachment = await this.attachmentRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException('File not found');
    }

    await this.digitalOceanSpacesService.deleteFile(this.bucketName, attachment.path);
    await this.attachmentRepository.remove(attachment);
    return { message: "Deleted successfully." }

  }

  async update(
    id: number,
    dto:UpdateAttachmentDto,
    file?: Express.Multer.File,
  ): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({ where: { id, is_deleted: false } });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Update file if provided
    if (file) {
      const fileExtension = file.originalname.split('.').pop();
      const newKey = `${dto.type || attachment.file_type}/${Date.now()}_${attachment.file_name}`;

      // Delete the old file from DigitalOcean Spaces
    await this.digitalOceanSpacesService.deleteFile(this.bucketName, attachment.path);


      // Upload the new file
      const uploadResult = await this.digitalOceanSpacesService.uploadFile(
        this.bucketName,
        newKey,
        file.buffer,
        file.mimetype
      );

      // Update attachment entity with new file details
      attachment.path = uploadResult.Key;
      attachment.url = uploadResult.Location;
      attachment.file_name = file.originalname;
      attachment.mimeType = file.mimetype;
      attachment.size = file.size;
    }

    // Update metadata if provided
    if (dto.type) attachment.file_type = dto.type;
    if (!file) attachment.file_name = `${attachment.file_name.split('.').pop()}`;

    return this.attachmentRepository.save(attachment);
  }

}
