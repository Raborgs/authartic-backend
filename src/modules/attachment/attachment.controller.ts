import {
  Get, Param, Put, Delete, Controller, Post, UseInterceptors,
  UploadedFile, UploadedFiles, Body
} from '@nestjs/common';
import { AttachmentService } from './attachment.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { throwIfError } from 'src/utils/error-handler.util';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';

@Controller('attachments')
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createAttachmentDto: CreateAttachmentDto,
  ) {
    const attachment = await this.attachmentService.create(file, createAttachmentDto);
    return {
      message: `files uploaded successfully`,
      data: attachment,
    };

  }

  @Post('upload/multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultiple(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body('type') type: string
  ) {

    throwIfError((!files || files.length === 0), 'File is required.')

    const uploadPromises = files.map((file, i) =>
      this.attachmentService.create(file, Array.isArray(type) ? type[i] : type)
    );
    const uploadResults = await Promise.all(uploadPromises);
    return {
      message: `${files.length} files uploaded successfully`,
      data: uploadResults,
    };
  }

  @Get()
  findAll() {
    return this.attachmentService.findAll();
  }

  @Get(':id')
  getAttachmentByCompanyID(@Param('id') id: string) {
    return this.attachmentService.getAttachmentByCompanyID(+id);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() updateAttachmentDto: UpdateAttachmentDto,

  ) {
    throwIfError((!id), 'Attachment id is to update.')
    const updatedAttachment = await this.attachmentService.update(
      +id,
      updateAttachmentDto,
      file,
    );

    return {
      message: 'Attachment updated successfully',
      data: updatedAttachment,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.attachmentService.remove(+id);
  }
}
