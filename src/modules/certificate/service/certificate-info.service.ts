import * as archiver from 'archiver';
import * as QRCode from 'qrcode';
import e, { Response } from 'express';
import { Injectable, NotFoundException, Res, Body, ForbiddenException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository, DataSource } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Certificate } from '../entities/certificate.entity';
import { CertificateInfo } from '../entities/certificate-info.entity';
import { CreateCertificateInfoDto } from '../dto/create-certificate-info.dto';
import { CertificateOwner } from '../entities/certificate-owner.entity';
import { Attachment } from 'src/modules/attachment/entities/attachment.entity';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';
import { AttachmentService } from 'src/modules/attachment/attachment.service';
import { GetCertificateInfoDto } from '../dto/get-certificate-info.dto';
import { transformGetCertificateInfoToDto } from 'src/utils/certificate-transform.util';
import { UpdateSubscriptionStatusDto } from 'src/modules/subscription/dto/update-subscription-status.dto';
import { SubscriptionStatusService } from 'src/modules/subscription/services/Subscription-status.service';
import { MailService } from 'src/modules/common/service/email.service';
import { throwIfError } from 'src/utils/error-handler.util';
import { SubscriptionStatus } from 'src/modules/subscription/entities/subscription-status.entity';
import { VendorInfo } from 'src/modules/user/entities/vendor-info.entity';


@Injectable()
export class CertificateInfoService {
  private readonly baseUrl: string = process.env.BACKEND_URL || 'http://localhost:5000';
  constructor(
    @InjectRepository(SubscriptionStatus)
    private readonly subscriptionStatusRepository: Repository<SubscriptionStatus>,
    @InjectRepository(CertificateInfo)
    private readonly certificateInfoRepository: Repository<CertificateInfo>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(VendorInfo)
    private readonly vendorInfoRepository: Repository<VendorInfo>,
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    private readonly dataSource: DataSource,
    private readonly attachmentService: AttachmentService,
    private readonly subscriptionStatusService: SubscriptionStatusService,
    private readonly mailService: MailService,

  ) { }

  async reIssueExistingCertificate(
    id: number,
    certificate_id: number,
    user: User,
    res: Response
  ): Promise<void> {
    throwIfError(!id || !certificate_id, 'Certificate ID is required.');

    const subscriptionStatus = await this.subscriptionStatusRepository.findOne({
      where: { user: { id: user.id }, is_expired: false },
      relations: ['subscriptionPlan', 'subscriptionPlan.subscriptionPlanFeatures'],
    });

    throwIfError(!subscriptionStatus, `Vendor with ID ${user.id} not found or not authorized.`);
    throwIfError(subscriptionStatus.is_expired, 'Your subscription plan has expired. Please upgrade now.');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingCertificate = await this.certificateRepository.findOne({
        where: {
          id: certificate_id,
          certificateInfo: { id: id, created_by_vendor: { id: user.id } },
        },
        relations: ['certificateInfo'],
      });

      throwIfError(!existingCertificate, `Certificate with ID ${certificate_id} not found.`, NotFoundException);
      throwIfError(
        existingCertificate.is_deleted && existingCertificate.status === 2,
        `Already re-issued certificate for this certificate with ID ${certificate_id}.`
      );

      existingCertificate.status = 2;
      existingCertificate.is_deleted = true;
      await queryRunner.manager.save(existingCertificate);

      const newCertificate = new Certificate();
      newCertificate.serial_number = `SN-${Date.now()}`;
      newCertificate.certificateInfo = existingCertificate.certificateInfo;
      const savedCertificate = await queryRunner.manager.save(newCertificate);

      const qrCodeDataUrl = `${this.baseUrl}/api/v1/certificate/claim-certificate/${savedCertificate.id}/scan`;
      savedCertificate.qr_code = qrCodeDataUrl;
      await queryRunner.manager.save(savedCertificate);

      const newCertificateOwner = new CertificateOwner();
      newCertificateOwner.certificate = savedCertificate;
      newCertificateOwner.is_owner = true;
      newCertificateOwner.user = user;
      await queryRunner.manager.save(newCertificateOwner);

      const certificateInfo = existingCertificate.certificateInfo;
      certificateInfo.saved_draft = false;
      certificateInfo.issued += 1;
      await queryRunner.manager.save(certificateInfo);

      const updateSubscriptionStatusDto = new UpdateSubscriptionStatusDto();
      updateSubscriptionStatusDto.total_certificates_issued = subscriptionStatus.total_certificates_issued + 1;
      updateSubscriptionStatusDto.remaining_certificates = subscriptionStatus.remaining_certificates - 1;
      await this.subscriptionStatusService.updateSubscriptionStatus(subscriptionStatus.id, 1, updateSubscriptionStatusDto);

      const svgBuffers = await this.generateSVGBuffers([{ qrCode: qrCodeDataUrl, id: savedCertificate.id }], certificateInfo.name, certificateInfo.description);
      const zipBuffer = await this.generateZipBuffer(svgBuffers);
      await this.mailService.sendCertificateInfoZip(user.email, zipBuffer);

      await queryRunner.commitTransaction();
      res.status(201).json({ message: `Certificate reissued and sent to ${user.email}` });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getAllCertificateInfo(
    name: string | null,
    saved_draft: boolean | false,
    page: number = 1,
    limit: number = 8,

    user: User
  ): Promise<{ data: GetCertificateInfoDto[], total: number, pages: number }> {

    throwIfError((page < 1), 'Page number must be greater than 0.')
    throwIfError((limit < 1), 'Limit must be greater than 0.')

    const isVendor = await this.userRepository.findOne({
      where: { id: user.id, role: UserRoleEnum.VENDOR },
    });

    throwIfError(!isVendor, `Vendor with ID ${user.id} not found or not authorized.`, NotFoundException)

    const queryOptions: any = {
      where: {
        created_by_vendor: {
          id: isVendor.id,
        },
        saved_draft: saved_draft ? saved_draft : false
      },
      relations: ['created_by_vendor', 'product_image', 'custom_bg'],
      skip: (page - 1) * limit,
      take: limit,
    };

    if (name) {
      queryOptions.where.name = ILike(`%${name}%`);
    }

    const [certificateInfo, total] = await this.certificateInfoRepository.findAndCount(queryOptions);

    const totalPages = Math.ceil(total / limit);

    return {
      total,
      pages: totalPages,
      data: certificateInfo?.map(transformGetCertificateInfoToDto),
    };
  }

  async getCertificateInfoById(
    id: number,
    saved_draft: boolean | false,
    user: User
  ): Promise<GetCertificateInfoDto> {

    throwIfError(!id, 'Certificate ID is required.')

    const isVendor = await this.userRepository.findOne({
      where: { id: user.id, role: UserRoleEnum.VENDOR },
    });

    throwIfError(!id, `Vendor with ID ${user.id} not found or not authorized.`, NotFoundException)

    const certificate = await this.certificateInfoRepository.findOne({
      where: {
        id: id,
        created_by_vendor: {
          id: isVendor.id,
        },
        saved_draft: saved_draft ? saved_draft : false,

      },
      relations: ['created_by_vendor', 'product_image', 'custom_bg'],
    });

    throwIfError(!certificate, 'Certificate not found.', NotFoundException)

    return transformGetCertificateInfoToDto(certificate);
  }

  async create(createCertificateInfoDto: CreateCertificateInfoDto, user: User, res: Response): Promise<CertificateInfo> {
    throwIfError(user.role !== UserRoleEnum.VENDOR, 'Only VENDOR can create certificate.');

    // Load vendorInfo and subscriptionStatus for the user
    const vendorInfo = await this.vendorInfoRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['validationCode'],
    });

    throwIfError(!vendorInfo || !vendorInfo.validationCode, 'Your account is not verified yet. Please contact the admin.', ForbiddenException);

    const isSubscriptionStatusExpire = await this.subscriptionStatusRepository.findOne({
      where: { user: { id: user.id }, is_expired: true },
      relations: ['subscriptionPlan', 'subscriptionPlan.subscriptionPlanFeatures'],
    });
    throwIfError(isSubscriptionStatusExpire, "Your subscription plan has expired. Please upgrade now.", ForbiddenException);

    const subscriptionStatus = await this.subscriptionStatusRepository.findOne({
      where: { user: { id: user.id }, is_expired: false },
      relations: ['subscriptionPlan', 'subscriptionPlan.subscriptionPlanFeatures'],
    });
    throwIfError(!subscriptionStatus, "You don't have any active subscription plan.", ForbiddenException);

    throwIfError(
      subscriptionStatus.remaining_certificates < createCertificateInfoDto.number_of_certificate,
      `You have only ${subscriptionStatus.remaining_certificates} certificates available.`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const productImage = await this.attachmentRepository.findOne({ where: { id: createCertificateInfoDto.product_image_id } });
      throwIfError(!productImage, 'Product image is not found.');

      const newCertificateInfo = new CertificateInfo();
      newCertificateInfo.name = createCertificateInfoDto.name;
      newCertificateInfo.description = createCertificateInfoDto.description;
      newCertificateInfo.font = createCertificateInfoDto.font;
      newCertificateInfo.font_color = createCertificateInfoDto.font_color;
      newCertificateInfo.bg_color = createCertificateInfoDto.bg_color;
      newCertificateInfo.product_sell = createCertificateInfoDto.product_sell;
      newCertificateInfo.saved_draft = createCertificateInfoDto.saved_draft;
      newCertificateInfo.created_by_vendor = user;
      newCertificateInfo.product_image = productImage;

      if (createCertificateInfoDto.saved_draft || createCertificateInfoDto.number_of_certificate === undefined) {
        newCertificateInfo.issued = 0;
        newCertificateInfo.issued_date = null;
      } else {
        newCertificateInfo.issued = createCertificateInfoDto.number_of_certificate;
      }

      if (createCertificateInfoDto.custom_bg) {
        const customBg = await this.attachmentRepository.findOne({ where: { id: createCertificateInfoDto.custom_bg } });
        throwIfError(!customBg, 'Background image not found.');
        newCertificateInfo.custom_bg = customBg;
      }

      await queryRunner.manager.save(newCertificateInfo);

      const qrCodes = [];
      const svgBuffers: Buffer[] = [];
      for (let i = 0; i < createCertificateInfoDto.number_of_certificate; i++) {
        const newCertificate = new Certificate();
        newCertificate.serial_number = `SN-${i + 1}-${Date.now()}`;
        newCertificate.certificateInfo = newCertificateInfo;
        const savedCertificate = await queryRunner.manager.save(newCertificate);
        const qrCodeDataUrl = `${this.baseUrl}/api/v1/certificate/claim-certificate/${savedCertificate.id}/scan`;
        newCertificate.qr_code = qrCodeDataUrl;
        await queryRunner.manager.save(newCertificate);
        const newCertificateOwner = new CertificateOwner();
        newCertificateOwner.certificate = savedCertificate;
        newCertificateOwner.is_owner = true;
        newCertificateOwner.user = user;
        await queryRunner.manager.save(newCertificateOwner);
        qrCodes.push({ qrCode: qrCodeDataUrl, id: newCertificate.id });
      }

      const updateSubscriptionStatusDto = new UpdateSubscriptionStatusDto();
      updateSubscriptionStatusDto.total_certificates_issued = subscriptionStatus.total_certificates_issued + createCertificateInfoDto.number_of_certificate;
      updateSubscriptionStatusDto.remaining_certificates = subscriptionStatus.remaining_certificates - createCertificateInfoDto.number_of_certificate;

      await this.subscriptionStatusService.updateSubscriptionStatus(subscriptionStatus.id, createCertificateInfoDto.number_of_certificate, updateSubscriptionStatusDto);

      svgBuffers.push(...(await this.generateSVGBuffers(qrCodes, createCertificateInfoDto.name, createCertificateInfoDto.description)));
      const zipBuffer = await this.generateZipBuffer(svgBuffers);

      await this.mailService.sendCertificateInfoZip(user.email, zipBuffer);

      await queryRunner.commitTransaction();
      res.status(201).json({ message: `Certificates created and sent to ${user.email}` });

      return newCertificateInfo;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async generateSVGBuffers(qrCodes: { qrCode: string; id: number }[], name: string, description: string): Promise<Buffer[]> {
    const svgBuffers: Buffer[] = [];
    for (const qrCodeData of qrCodes) {
      const qrCodeImageUrl = await QRCode.toDataURL(qrCodeData.qrCode);


      //   <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
      //   <rect width="100%" height="100%" fill="white"/>
      //   <text x="20" y="40" font-family="Arial" font-size="24" fill="black">Name: ${name}</text>
      //   <text x="20" y="80" font-family="Arial" font-size="24" fill="black">Description: ${description}</text>
      //   <text x="20" y="120" font-family="Arial" font-size="20" fill="black">ID: ${qrCodeData.id}</text>
      //   <image x="20" y="160" width="200" height="200" href="${qrCodeImageUrl}" />
      // </svg>
      const svgContent = `

        <svg width="210mm" height="297mm" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#fdfdfd" />

  <rect x="15mm" y="15mm" width="180mm" height="267mm" fill="none" stroke="#4a90e2" stroke-width="5"/>
  <rect x="20mm" y="20mm" width="170mm" height="257mm" fill="none" stroke="#dcdcdc" stroke-width="3"/>

  <text x="50%" y="30mm" font-family="Georgia" font-size="36" fill="#333" text-anchor="middle">
    Authartic Certificate Information
  </text>

  <text x="50%" y="70mm" font-family="Arial" font-size="24" fill="#4a90e2" text-anchor="middle">
    Name: ${name}
  </text>

  <text x="50%" y="90mm" font-family="Arial" font-size="20" fill="#333" text-anchor="middle" font-style="italic">
    Description: ${description}
  </text>

  <text x="50%" y="110mm" font-family="Arial" font-size="18" fill="#666" text-anchor="middle">
    ID: ${qrCodeData.id}
  </text>

  <image x="50%" y="140mm" width="50mm" height="50mm" href="${qrCodeImageUrl}" transform="translate(-25mm)" />

  <line x1="20mm" y1="260mm" x2="190mm" y2="260mm" stroke="#dcdcdc" stroke-width="2" />

  <text x="50%" y="275mm" font-family="Arial" font-size="14" fill="#999" text-anchor="middle">
    This certificate is proudly presented to ${name}.
  </text>
</svg>

      `;
      svgBuffers.push(Buffer.from(svgContent));
    }
    return svgBuffers;
  }

  private async generateZipBuffer(svgBuffers: Buffer[]): Promise<Buffer> {
    const archive = archiver('zip');
    const zipBuffers: Buffer[] = [];
    archive.on('data', zipBuffers.push.bind(zipBuffers));

    svgBuffers.forEach((pdfBuffer, index) => {
      archive.append(pdfBuffer, { name: `certificate${index + 1}.svg` });
    });
    archive.finalize();

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (archive.pointer() > 0) {
          clearInterval(interval);
          const zipBuffer = Buffer.concat(zipBuffers);
          resolve(zipBuffer);
        }
      }, 100);
    });
  }

  async reIssueCertificate(id: number, number_of_certificate: number, user: User, @Res() res: Response): Promise<void> {
    throwIfError(!id, 'Certificate ID is required.');
    throwIfError(user.role !== UserRoleEnum.VENDOR, 'Only VENDOR can re-issue certificates.');

    const vendorInfo = await this.vendorInfoRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['validationCode'],
    });

    throwIfError(!vendorInfo || !vendorInfo.validationCode, 'Your account is not verified yet. Please contact the admin.', ForbiddenException);

    const subscriptionStatus = await this.subscriptionStatusRepository.findOne({
      where: { user: { id: user.id }, is_expired: false },
      relations: ['subscriptionPlan', 'subscriptionPlan.subscriptionPlanFeatures'],
    });

    throwIfError(!subscriptionStatus, "You don't have any active subscription plan.", ForbiddenException);
    throwIfError(subscriptionStatus.is_expired, 'Your subscription plan has expired. Please upgrade now.', ForbiddenException);
    throwIfError(subscriptionStatus.remaining_certificates < number_of_certificate, `You have only ${subscriptionStatus.remaining_certificates} certificates available.`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const certificateInfo = await this.certificateInfoRepository.findOne({
        where: { id: id, created_by_vendor: { id: user.id } },
        relations: ['created_by_vendor', 'product_image', 'custom_bg'],
      });

      throwIfError(!certificateInfo, `Certificate with ID ${id} not found.`, NotFoundException);

      const qrCodes = [];
      const svgBuffers: Buffer[] = [];

      for (let i = 0; i < number_of_certificate; i++) {
        const newCertificate = new Certificate();
        newCertificate.serial_number = `SN-${i + 1}-${Date.now()}`;
        newCertificate.certificateInfo = certificateInfo;

        const savedCertificate = await queryRunner.manager.save(newCertificate);
        const qrCodeDataUrl = `${this.baseUrl}/api/v1/certificate/claim-certificate/${savedCertificate.id}/scan`;

        newCertificate.qr_code = qrCodeDataUrl;
        await queryRunner.manager.save(newCertificate);

        const newCertificateOwner = new CertificateOwner();
        newCertificateOwner.certificate = savedCertificate;
        newCertificateOwner.is_owner = true;
        newCertificateOwner.user = user;

        await queryRunner.manager.save(newCertificateOwner);
        qrCodes.push({ qrCode: qrCodeDataUrl, id: newCertificate.id });
      }

      const updateSubscriptionStatusDto = new UpdateSubscriptionStatusDto();
      updateSubscriptionStatusDto.total_certificates_issued = subscriptionStatus.total_certificates_issued + number_of_certificate;
      updateSubscriptionStatusDto.remaining_certificates = subscriptionStatus.remaining_certificates - number_of_certificate;

      await this.subscriptionStatusService.updateSubscriptionStatus(subscriptionStatus.id, number_of_certificate, updateSubscriptionStatusDto);

      svgBuffers.push(...(await this.generateSVGBuffers(qrCodes, certificateInfo.name, certificateInfo.description)));
      const zipBuffer = await this.generateZipBuffer(svgBuffers);

      await this.mailService.sendCertificateInfoZip(user.email, zipBuffer);
      certificateInfo.saved_draft = false
      await queryRunner.manager.save(certificateInfo);
      await queryRunner.commitTransaction();

      res.status(201).json({ message: `Certificates re-issued for existing and sent to ${user.email}` });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

