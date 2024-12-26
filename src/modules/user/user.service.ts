import { Injectable, NotFoundException, ConflictException, UnauthorizedException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { Repository, DataSource, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Attachment } from 'src/modules/attachment/entities/attachment.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { ValidationCode } from 'src/modules/validation-code/entities/validation-code.entity';
import { checkIsAdmin } from 'src/utils/check-is-admin.util';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { VendorInfo } from './entities/vendor-info.entity';
import { VerifyVendorDto } from './dto/verify-vendor.dto';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';
import { MailService } from '../common/service/email.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserProfile } from './entities/user-profile.entity';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { SearchEmailDto } from './dto/search-email.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { throwIfError } from 'src/utils/error-handler.util';
import { SubscriptionStatusService } from '../subscription/services/Subscription-status.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(VendorInfo)
    private readonly vendorInfoRepository: Repository<VendorInfo>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    private jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly subscriptionStatusService: SubscriptionStatusService,
    private readonly dataSource: DataSource
  ) { }


  // async updateUser(updateUserDto: UpdateUserDto, user: User): Promise<Omit<User, 'password'>> {
  //   const queryRunner = this.dataSource.createQueryRunner();
  //   await queryRunner.connect();
  //   await queryRunner.startTransaction();

  //   try {
  //     const existingUser = await queryRunner.manager.findOne(User, {
  //       where: { id: user.id },
  //       relations: ['country'],
  //     });
  //     throwIfError(!existingUser, `User not found.`, NotFoundException);

  //     existingUser.user_name = updateUserDto.user_name || existingUser.user_name;

  //     if (updateUserDto.country_id) {
  //       const country = await queryRunner.manager.findOne(Country, { where: { id: updateUserDto.country_id, is_deleted: false } });
  //       throwIfError(!country, `Country with ID ${updateUserDto.country_id} not found.`, NotFoundException);
  //       existingUser.country = country;
  //     }

  //     if (existingUser.role === UserRoleEnum.USER) {
  //       const userProfile = await this.userProfileRepository.findOne({ where: { user: { id: existingUser.id } } });
  //       throwIfError(!userProfile, 'User profile not found.', NotFoundException);

  //       userProfile.phone = updateUserDto.phone || userProfile.phone;
  //       userProfile.date_of_birth = updateUserDto.date_of_birth ? new Date(updateUserDto.date_of_birth) : userProfile.date_of_birth;

  //       if (updateUserDto.attachment_id) {
  //         const attachment = await queryRunner.manager.findOne(Attachment, { where: { id: updateUserDto.attachment_id, is_deleted: false } });
  //         throwIfError(!attachment, `Attachment not found.`, NotFoundException);
  //         userProfile.attachment = attachment;
  //       }
  //       await queryRunner.manager.save(UserProfile, userProfile);
  //     } else if (existingUser.role === UserRoleEnum.VENDOR) {
  //       const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: existingUser.id } } });
  //       throwIfError(!vendorInfo, 'Vendor info not found.', NotFoundException);

  //       vendorInfo.phone = updateUserDto.phone || vendorInfo.phone;
  //       vendorInfo.primary_content = updateUserDto.primary_content || vendorInfo.primary_content;
  //       vendorInfo.about_brand = updateUserDto.about_brand || vendorInfo.about_brand;
  //       vendorInfo.website_url = updateUserDto.website_url || vendorInfo.website_url;
  //       vendorInfo.social_media = updateUserDto.social_media || vendorInfo.social_media;
  //       vendorInfo.other_links = updateUserDto.other_links || vendorInfo.other_links;

  //       if (updateUserDto.attachment_id) {
  //         const attachment = await queryRunner.manager.findOne(Attachment, { where: { id: updateUserDto.attachment_id, is_deleted: false } });
  //         throwIfError(!attachment, `Attachment not found.`, NotFoundException);
  //         vendorInfo.attachment = attachment;
  //       }
  //       await queryRunner.manager.save(VendorInfo, vendorInfo);
  //     }

  //     await queryRunner.manager.save(User, existingUser);
  //     await queryRunner.commitTransaction();

  //     return await this.findUserById(existingUser.id);
  //   } catch (error) {
  //     await queryRunner.rollbackTransaction();
  //     throw error;
  //   } finally {
  //     await queryRunner.release();
  //   }
  // }

  private isPasswordValid(password: string): boolean {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,20}$/;
    return passwordRegex.test(password);
  }


  async updateUser(updateUserDto: UpdateUserDto, user: User): Promise<Omit<User, 'password'>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { email, old_password, new_password } = updateUserDto;

      const existingUser = await queryRunner.manager.findOne(User, {
        where: { id: user.id },
        relations: ['country'],
      });
      throwIfError(!existingUser, `User not found.`, NotFoundException);

      // Update email with validation for uniqueness
      if (email) {
        const emailUser = await this.userRepository.findOne({
          where: { email, id: Not(user.id) }, // Check if another user has this email
        });
        throwIfError(emailUser, 'Email is already in use by another user.', ConflictException);
        existingUser.email = email;
      }

      if (new_password) {
        if (!old_password) {
          throw new BadRequestException(
            'To update your password, please provide your current password.'
          );
        }

        const isOldPasswordValid = await bcrypt.compare(old_password, existingUser.password);
        if (!isOldPasswordValid) {
          throw new UnauthorizedException(
            'The current password you provided is incorrect. Please try again.'
          );
        }

        if (!this.isPasswordValid(new_password)) {
          throw new BadRequestException(
            'The new password must meet the following requirements: ' +
            'at least one uppercase letter, one lowercase letter, one number, ' +
            'one special character, and be 8-20 characters long.'
          );
        }

        existingUser.password = await bcrypt.hash(new_password, 10);
      }


      // Update other fields
      existingUser.user_name = updateUserDto.user_name || existingUser.user_name;

      if (updateUserDto.country_id) {
        const country = await queryRunner.manager.findOne(Country, { where: { id: updateUserDto.country_id, is_deleted: false } });
        throwIfError(!country, `Country with ID ${updateUserDto.country_id} not found.`, NotFoundException);
        existingUser.country = country;
      }

      if (existingUser.role === UserRoleEnum.USER) {
        const userProfile = await this.userProfileRepository.findOne({ where: { user: { id: existingUser.id } } });
        throwIfError(!userProfile, 'User profile not found.', NotFoundException);

        userProfile.phone = updateUserDto.phone || userProfile.phone;
        userProfile.date_of_birth = updateUserDto.date_of_birth ? new Date(updateUserDto.date_of_birth) : userProfile.date_of_birth;

        if (updateUserDto.attachment_id) {
          const attachment = await queryRunner.manager.findOne(Attachment, { where: { id: updateUserDto.attachment_id, is_deleted: false } });
          throwIfError(!attachment, `Attachment not found.`, NotFoundException);
          userProfile.attachment = attachment;
        }
        await queryRunner.manager.save(UserProfile, userProfile);
      }

      if (existingUser.role === UserRoleEnum.VENDOR) {
        const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: existingUser.id } } });
        throwIfError(!vendorInfo, 'Vendor info not found.', NotFoundException);

        vendorInfo.phone = updateUserDto.phone || vendorInfo.phone;
        vendorInfo.primary_content = updateUserDto.primary_content || vendorInfo.primary_content;
        vendorInfo.about_brand = updateUserDto.about_brand || vendorInfo.about_brand;
        vendorInfo.website_url = updateUserDto.website_url || vendorInfo.website_url;
        vendorInfo.social_media = updateUserDto.social_media || vendorInfo.social_media;
        vendorInfo.other_links = updateUserDto.other_links || vendorInfo.other_links;

        if (updateUserDto.attachment_id) {
          const attachment = await queryRunner.manager.findOne(Attachment, { where: { id: updateUserDto.attachment_id, is_deleted: false } });
          throwIfError(!attachment, `Attachment not found.`, NotFoundException);
          vendorInfo.attachment = attachment;
        }
        await queryRunner.manager.save(VendorInfo, vendorInfo);
      }

      await queryRunner.manager.save(User, existingUser);
      await queryRunner.commitTransaction();

      return this.findUserById(existingUser.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async verifyVendor(verifyVendorDto: VerifyVendorDto, user: User): Promise<Omit<User, 'password'>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      checkIsAdmin(user, 'Only Admin can verify vendors.');

      const existingVendor = await this.userRepository.findOne({
        where: { id: verifyVendorDto.vendor_id, role: UserRoleEnum.VENDOR, is_deleted: false },
        relations: ['country'],
      });
      throwIfError(!existingVendor, 'Vendor does not exist.', NotFoundException);

      const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: existingVendor.id } }, relations: ['validationCode'] });
      throwIfError(!vendorInfo, 'Vendor info not found.', NotFoundException);
      throwIfError(vendorInfo.validationCode, 'Vendor is already verified.', ConflictException);

      const validationCode = await this.dataSource.manager.findOne(ValidationCode, {
        where: { code: verifyVendorDto.validation_code, is_deleted: false, is_used: false },
      });
      throwIfError(!validationCode, 'Validation code not found or already used.', NotFoundException);

      vendorInfo.validationCode = validationCode;
      validationCode.is_used = true;
      await queryRunner.manager.save(vendorInfo);
      await queryRunner.manager.save(validationCode);
      await queryRunner.commitTransaction();

      return this.findUserById(existingVendor.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }


  async findAllVendors(
    user: User,
    { page = 1, limit = 10, is_verified = true, name }: { page?: number; limit?: number; is_verified?: boolean; name?: string }
  ): Promise<any> {
    // Ensure the user is an admin
    checkIsAdmin(user, 'Only an admin can access this data.');

    // Create query builder for User and join VendorInfo explicitly
    const query = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.country', 'country') // Join with Country
      .leftJoinAndSelect('VendorInfo', 'vendorInfo', 'vendorInfo.user = user.id') // Join VendorInfo where user_id matches
      .leftJoinAndSelect('vendorInfo.attachment', 'attachment') // Join VendorInfo's attachment
      .leftJoinAndSelect('vendorInfo.validationCode', 'validationCode') // Join VendorInfo's validationCode
      .where('user.role = :role', { role: UserRoleEnum.VENDOR }) // Filter by role
      .andWhere('user.is_deleted = false'); // Exclude deleted users

    // Filter based on verification status
    if (is_verified) {
      query.andWhere('vendorInfo.validationCode IS NOT NULL'); // Verified vendors
    } else {
      query.andWhere('vendorInfo.validationCode IS NULL'); // Unverified vendors
    }

    // Filter based on name if provided
    if (name) {
      query.andWhere('LOWER(user.user_name) LIKE LOWER(:name)', { name: `%${name}%` });
    }

    // Get total count of matching vendors
    const totalCount = await query.getCount();

    // Fetch paginated results
    const unverifiedVendors = await query.skip((page - 1) * limit).take(limit).getMany();

    // Transform the data into the desired format
    const vendors = unverifiedVendors.map((vendor) => {
      return {
        id: vendor.id,
        vendor_name: vendor.user_name,
        email: vendor.email,
        role: vendor.role,
        country: vendor.country?.name || null,
        verification_status: vendor['vendorInfo']?.validationCode ? 'Verified' : 'Unverified',
        validation_code: vendor['vendorInfo']?.validationCode?.code || null,
      };
    });

    // Return the final paginated response
    return {
      is_verified: is_verified,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      data: vendors,
    };
  }


  async findAllUsers(
    user: User,
    { page = 1, limit = 10, name }: { page?: number; limit?: number; name?: string }
  ): Promise<any> {
    // Ensure the user is an admin
    checkIsAdmin(user, 'Only an admin can access this data');

    // Create query builder for User and join UserProfile explicitly
    const query = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('UserProfile', 'userProfile', 'userProfile.user = user.id') // Join UserProfile where user_id matches
      .where('user.role = :role', { role: UserRoleEnum.USER }) // Filter by user role
      .andWhere('user.is_deleted = false'); // Exclude deleted users

    // Filter based on name if provided
    if (name) {
      query.andWhere('LOWER(user.user_name) LIKE LOWER(:name)', { name: `%${name}%` });
    }

    // Get total count of matching users
    const totalCount = await query.getCount();

    // Fetch paginated results
    const users = await query.skip((page - 1) * limit).take(limit).getMany();

    // Transform the data into the desired format
    const userDetails = users.map((user) => {
      return {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        role: user.role,
        profile: {
          phone: user['userProfile']?.phone || null,
          date_of_birth: user['userProfile']?.date_of_birth || null,
        },
      };
    });

    // Return the final paginated response
    return {
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      data: userDetails,
    };
  }

  async findUserById(id: number): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: id, is_deleted: false },
      relations: ['country'],
    });
    throwIfError(!user, 'User not found.', NotFoundException);

    // Initialize the data object with basic user fields common to all roles
    const userData: any = {
      id: user.id,
      email: user.email,
      role: user.role,
      country: user.country ? {
        id: user.country.id,
        name: user.country.name,
        code: user.country.code
      } : null
    };

    if (user.role === UserRoleEnum.USER) {
      const userProfile = await this.userProfileRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['attachment'],
      });

      userData.user_name = user.user_name;
      userData.date_of_birth = userProfile?.date_of_birth || null;
      userData.phone = userProfile?.phone || null;
      userData.is_email_verified = userProfile?.is_verified_email || false;
      userData.profile_image = userProfile?.attachment ? {
        id: userProfile.attachment.id,
        url: userProfile.attachment.url,
        type: userProfile.attachment.file_type
      } : null;

    } else if (user.role === UserRoleEnum.VENDOR) {
      const vendorInfo = await this.vendorInfoRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['attachment', 'validationCode'],
      });

      userData.vendor_name = user.user_name;
      userData.primary_content = vendorInfo?.primary_content || null;
      userData.phone = vendorInfo?.phone || null;
      userData.about_brand = vendorInfo?.about_brand || null;
      userData.website_url = vendorInfo?.website_url || null;
      userData.social_media = vendorInfo?.social_media || [];
      userData.other_links = vendorInfo?.other_links || [];
      userData.is_email_verified = vendorInfo?.is_verified_email || false;
      userData.vendor_logo = vendorInfo?.attachment ? {
        id: vendorInfo.attachment.id,
        url: vendorInfo.attachment.url,
        type: vendorInfo.attachment.file_type
      } : null;
      userData.validation_code = vendorInfo?.validationCode ? {
        id: vendorInfo.validationCode.id,
        code: vendorInfo.validationCode.code,
        is_used: vendorInfo.validationCode.is_used
      } : null;

      // If a subscriptionStatus exists, retrieve it here
      const subscriptionStatus = await this.subscriptionStatusService.findByUserId(user.id);
      userData.subscriptionStatus = subscriptionStatus ? {
        id: subscriptionStatus.id,
        remaining_certificates: subscriptionStatus.remaining_certificates,
        total_certificates_issued: subscriptionStatus.total_certificates_issued,
        is_expired: subscriptionStatus.is_expired,
        plan_activated_date: subscriptionStatus.plan_activated_date,
        plan_expiry_date: subscriptionStatus.plan_expiry_date,
        subscriptionPlan: subscriptionStatus.subscriptionPlan ? {
          id: subscriptionStatus.subscriptionPlan.id,
          name: subscriptionStatus.subscriptionPlan.name,
          price: subscriptionStatus.subscriptionPlan.price,
          billingCycle: subscriptionStatus.subscriptionPlan.billingCycle,
          description: subscriptionStatus.subscriptionPlan.description,
          subscriptionPlanFeatures: subscriptionStatus.subscriptionPlan.subscriptionPlanFeatures.map(feature => ({
            id: feature.id,
            name: feature.name,
            description: feature.description,
            value: feature.value,
            additional_cost: feature.additional_cost
          }))
        } : null
      } : null;
    }

    return userData;
  }




  async findUserByIdWithAttachments(id: number): Promise<any> {
    // Step 1: Find the base user entity without direct relations to userProfile and vendorInfo
    const user = await this.userRepository.findOne({
      where: { id, is_deleted: false },
      relations: ['country'],
    });
    throwIfError(!user, 'User not found.', NotFoundException);

    // Step 2: Based on the user's role, fetch additional related entities
    if (user.role === UserRoleEnum.USER) {
      // Fetch UserProfile along with its attachment
      const userProfile = await this.userProfileRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['attachment'],
      });
      return { ...user, userProfile };
    } else if (user.role === UserRoleEnum.VENDOR) {
      // Fetch VendorInfo along with its attachment and validationCode
      const vendorInfo = await this.vendorInfoRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['attachment', 'validationCode'],
      });
      return { ...user, vendorInfo };
    }

    // Return the user entity if no additional info is found (e.g., for roles that don’t have extra entities)
    return user;
  }


  async activateVendorAccount(token: string): Promise<{ message: string }> {
    const { email } = this.jwtService.verify(token);
    const user = await this.userRepository.findOne({
      where: { email },
    });
    throwIfError(!user, 'Invalid token or user not found.');

    if (user.role === UserRoleEnum.VENDOR) {
      const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: user.id } } });
      throwIfError(!vendorInfo, 'Vendor information not found.');

      vendorInfo.is_verified_email = true;
      await this.vendorInfoRepository.save(vendorInfo);
      return { message: 'Vendor account has been successfully activated.' };
    }
  }


  async activateAccountByUser(otp: string, user: User): Promise<{ message: string }> {
    throwIfError(!otp, 'OTP is required.');

    const userProfile = await this.userProfileRepository.findOne({
      where: { user: { id: user.id } },
    });

    throwIfError(!userProfile, 'User profile information not found.', NotFoundException);

    throwIfError(userProfile.is_verified_email, 'This account is already verified.', ConflictException);

    throwIfError(userProfile.otp !== otp, 'Invalid OTP.');

    userProfile.is_verified_email = true;
    userProfile.otp = '';
    await this.userProfileRepository.save(userProfile);

    return { message: 'Account successfully activated.' };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: verifyOtpDto.email, role: verifyOtpDto.role },
    });
    throwIfError(!user, 'User not found.', NotFoundException);

    if (user.role === UserRoleEnum.USER) {
      const userProfile = await this.userProfileRepository.findOne({ where: { user: { id: user.id } } });
      throwIfError(!userProfile, 'User profile information not found.', NotFoundException);

      throwIfError(userProfile.otp !== verifyOtpDto.otp, 'Invalid OTP.');

      userProfile.is_verified_email = true;
      userProfile.otp = "";
      await this.userProfileRepository.save(userProfile);

    } else if (user.role === UserRoleEnum.VENDOR) {
      const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: user.id } } });
      throwIfError(!vendorInfo, 'Vendor profile information not found.', NotFoundException);

      throwIfError(vendorInfo.otp !== verifyOtpDto.otp, 'Invalid OTP.');

      vendorInfo.is_verified_email = true;
      vendorInfo.otp = "";
      await this.vendorInfoRepository.save(vendorInfo);
    } else {
      throw new BadRequestException('Unsupported user role.');
    }

    return { message: 'OTP verified successfully' };
  }

  async reSendOtpEmail(user: User): Promise<{ message: string }> {
    const isUser = await this.userRepository.findOne({
      where: { email: user.email },
    });
    throwIfError(!isUser, 'User not found.', NotFoundException);

    // Check if the email is already verified based on user role
    if (isUser.role === UserRoleEnum.USER) {
      const userProfile = await this.userProfileRepository.findOne({ where: { user: { id: isUser.id } } });
      throwIfError(!userProfile, 'User profile information not found.', NotFoundException);
      throwIfError(userProfile.is_verified_email, 'Email is already verified.', ConflictException);

      // Generate new OTP and save it to the user profile
      const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
      userProfile.otp = newOtp;
      await this.userProfileRepository.save(userProfile);

      // Send OTP email
      await this.mailService.sendOtpEmail(isUser.email, newOtp);
    } else if (isUser.role === UserRoleEnum.VENDOR) {
      const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: isUser.id } } });
      throwIfError(!vendorInfo, 'Vendor info not found.', NotFoundException);
      throwIfError(vendorInfo.is_verified_email, 'Email is already verified.', ConflictException);

      // Generate new OTP and save it to the vendor info
      const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
      vendorInfo.otp = newOtp;
      await this.vendorInfoRepository.save(vendorInfo);

      // Send OTP email
      await this.mailService.sendOtpEmail(isUser.email, newOtp);
    }

    return { message: `OTP has been sent to ${isUser.email}.` };
  }

  async resendOtpEmailToBoth(searchEmailDto: SearchEmailDto): Promise<{ message: string }> {
    const isUser = await this.userRepository.findOne({
      where: { email: searchEmailDto.email, role: searchEmailDto.role },
    });
    throwIfError(!isUser, 'User not found.', NotFoundException);

    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    if (isUser.role === UserRoleEnum.USER) {
      const userProfile = await this.userProfileRepository.findOne({ where: { user: { id: isUser.id } } });
      userProfile.otp = newOtp;
      await this.userProfileRepository.save(userProfile);
    } else if (isUser.role === UserRoleEnum.VENDOR) {
      const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: isUser.id } } });
      vendorInfo.otp = newOtp;
      await this.vendorInfoRepository.save(vendorInfo);
    }

    await this.mailService.sendOtpEmail(isUser.email, newOtp);
    return { message: `OTP has been sent to ${isUser.email}.` };
  }


  async resendVerificationEmail(user: User): Promise<void> {
    const isUser = await this.userRepository.findOne({
      where: { email: user.email },
    });
    throwIfError(!isUser.role, 'User not found.', NotFoundException);

    if (isUser.role === UserRoleEnum.VENDOR) {
      const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: isUser.id } } });
      throwIfError(vendorInfo.is_verified_email, 'Email is already verified.', ConflictException);
    }

    const token = this.jwtService.sign({ email: isUser.email });
    await this.mailService.sendActivationEmail(isUser.email, token);
  }

  async updatePassword(updateUserPasswordDto: UpdateUserPasswordDto): Promise<{ message: string }> {
    const isUser = await this.userRepository.findOne({ where: { email: updateUserPasswordDto.email, role: updateUserPasswordDto.role } });
    throwIfError(!isUser, 'User not found.', NotFoundException);

    const hashedPassword = await bcrypt.hash(updateUserPasswordDto.password, 10);
    isUser.password = hashedPassword;
    await this.userRepository.save(isUser);

    return { message: 'Password updated successfully' };
  }

  // async searchIsEmail(searchEmailDto: SearchEmailDto): Promise<string[]> {
  //   const user = await this.userRepository.findOne({
  //     where: { email: searchEmailDto.email, role: searchEmailDto.role },
  //   });

  //   if (user) return [user.email];

  //   const similarEmails = await this.userRepository
  //     .createQueryBuilder('user')
  //     .select('user.email')
  //     .where('user.email LIKE :email', { email: `%${searchEmailDto.email.split('@')[0]}%` })
  //     .andWhere('user.role = :role', { role: searchEmailDto.role })
  //     .limit(3)
  //     .getMany();

  //   return similarEmails.map(user => user.email);
  // }

  async searchIsEmail(searchEmailDto: SearchEmailDto): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { email: searchEmailDto.email, role: searchEmailDto.role },
    });

    throwIfError(!user, 'Email does not exist', NotFoundException);
    return [user.email]
  }


  async getVendorsCounts(user: User): Promise<{ verifiedVendors: number; unverifiedVendors: number }> {
    checkIsAdmin(user, 'Only Admin can access this data.');

    const totalVendors = await this.userRepository.count({
      where: { role: UserRoleEnum.VENDOR, is_deleted: false },
    });

    const verifiedVendors = await this.vendorInfoRepository.count({
      where: { is_verified_email: true },
    });

    const unverifiedVendors = totalVendors - verifiedVendors;
    return { verifiedVendors, unverifiedVendors };
  }

  async getUsersCounts(user: User): Promise<{ unverifiedUsers: number; verifiedUsers: number }> {
    checkIsAdmin(user, 'Only Admin can access this data.');

    const totalUsers = await this.userRepository.count({
      where: { role: UserRoleEnum.USER, is_deleted: false },
    });

    const verifiedUsers = await this.userProfileRepository.count({
      where: { is_verified_email: true },
    });

    const unverifiedUsers = totalUsers - verifiedUsers;
    return { unverifiedUsers, verifiedUsers };
  }

}