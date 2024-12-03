import { Module } from '@nestjs/common';
import { AttachmentService } from './attachment.service';
import { AttachmentController } from './attachment.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { DigitalOceanSpacesService } from 'src/s3/s3.service';


@Module({
  controllers: [AttachmentController],
  providers: [AttachmentService, DigitalOceanSpacesService],
  imports: [TypeOrmModule.forFeature([Attachment])],
  exports:[AttachmentService]
})
export class AttachmentModule { }
