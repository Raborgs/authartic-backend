import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { Certificate } from '../entities/certificate.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { CertificateOwner } from '../entities/certificate-owner.entity';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';
import { GetCertificateDto } from '../dto/get-certificate.dto';
import { transformGetCertificateToDto } from 'src/utils/certificate-transform.util';
import * as archiver from 'archiver';
import * as QRCode from 'qrcode';
import { GetAttachmentDto } from 'src/modules/attachment/dto/get-attachment.dto';
import { MailService } from 'src/modules/common/service/email.service';
import * as PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { AttachmentService } from 'src/modules/attachment/attachment.service';
import { Attachment } from 'src/modules/attachment/entities/attachment.entity';
import { throwIfError } from 'src/utils/error-handler.util';
import { VendorInfo } from 'src/modules/user/entities/vendor-info.entity';

@Injectable()
export class CertificateService {
  private readonly baseUrl: string = process.env.BACKEND_URL || 'http://localhost:5000';

  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    @InjectRepository(VendorInfo)
    private readonly vendorInfoRepository: Repository<VendorInfo>,
    @InjectRepository(CertificateOwner)
    private readonly mailService: MailService,
    private readonly attachmentService: AttachmentService,
    private readonly dataSource: DataSource,
  ) { }

  async getCertificates(name: string | null, user: User): Promise<GetCertificateDto[]> {
    // Check if the user has the vendor role
    const isVendor = await this.userRepository.findOne({
      where: { id: user.id, role: UserRoleEnum.USER },
    });
    throwIfError(!isVendor, 'Only vendors can access this data.', ForbiddenException);

    // Set up query options with necessary joins
    const queryOptions: any = {
      where: {
        owners: {
          user: {
            id: user.id,
            is_deleted: false,
          },
          is_owner: true,
          is_deleted: false,
        },
        is_deleted: false,
      },
      relations: [
        'certificateInfo',
        'owners',
        'owners.user',
        'certificateInfo.product_image',
        'certificateInfo.custom_bg',
        'certificateInfo.created_by_vendor',    

      ],
    };

    // Apply a name filter if provided
    if (name) {
      queryOptions.where.certificateInfo = {
        name: ILike(`%${name}%`),
      };
    }

    // Fetch certificates based on query options
    const certificates = await this.certificateRepository.find(queryOptions);

    // Collect unique creator IDs for VendorInfo retrieval
    const creatorUserIds = certificates
      .map(certificate => certificate.certificateInfo?.created_by_vendor?.id)
      .filter((id): id is number => typeof id === 'number');

    // Check if we have any creator IDs before querying VendorInfo
    let vendorInfoMap = new Map();
    if (creatorUserIds.length > 0) {
      // Fetch VendorInfo for each creator user ID
      const vendorInfos = await this.vendorInfoRepository.createQueryBuilder('vendorInfo')
        .leftJoinAndSelect('vendorInfo.attachment', 'attachment')
        .leftJoinAndSelect('vendorInfo.user', 'user')  
        .where('vendorInfo.user_id IN (:...creatorUserIds)', { creatorUserIds })
        .getMany();

      // Map VendorInfo by user ID for efficient access
      vendorInfoMap = new Map(vendorInfos.map(info => [info.user.id, info]));
    }

    // Transform certificates to DTOs and attach VendorInfo if available
    return certificates.map((certificate) => {
      const certificateDto = transformGetCertificateToDto(certificate);

      // Find VendorInfo for the creator and add it to the DTO if available
      const creatorUserId = certificate.certificateInfo?.created_by_vendor?.id;
      const vendorInfo = vendorInfoMap.get(creatorUserId);

      if (vendorInfo) {
        certificateDto.vendor = {
          id: vendorInfo.user.id,
          name: vendorInfo.user.user_name,  
          logo: vendorInfo.attachment?.url || '',
        };
      }

      return certificateDto;
    });
  }


  async scanCertificate(certificateId: number, user: User) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const isDeletedCertificate = await this.certificateRepository.findOne({
        where: { id: certificateId, status: 2, is_deleted: true },
        relations: ['owners'],
      });

      throwIfError(isDeletedCertificate, 'The certificate is no longer available for scanning.');

      const certificate = await this.certificateRepository.findOne({
        where: { id: certificateId, status: 1, is_deleted: false },
        relations: ['owners'],
      });

      throwIfError(!certificate, 'Certificate not found.', NotFoundException)

      const isAlreadyOwner = await this.certificateRepository.findOne({
        where: {
          id: certificateId,
          owners: {
            user: {
              id: user.id,
              is_deleted: false,
            },
            is_owner: true,
            is_deleted: false,
          },
        },
      });

      throwIfError(isAlreadyOwner, 'You are already owner')

      const currentOwner = certificate.owners.find(owner => owner.is_owner);

      if (currentOwner) {
        currentOwner.is_owner = false;
        await queryRunner.manager.save(CertificateOwner, currentOwner);
      }

      const newOwner = new CertificateOwner();
      newOwner.certificate = certificate;
      newOwner.user = user;
      newOwner.is_owner = true;
      await queryRunner.manager.save(CertificateOwner, newOwner);

      await queryRunner.commitTransaction();
      return { message: 'Ownership transferred successfully' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

}



