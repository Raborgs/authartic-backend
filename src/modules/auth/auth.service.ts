import {
    BadRequestException,
    Injectable,
    NotFoundException,
    ConflictException,
    UnauthorizedException,
    InternalServerErrorException

} from '@nestjs/common';
import { ILike, Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UserProfile } from 'src/modules/user/entities/user-profile.entity';
import { VendorInfo } from 'src/modules/user/entities/vendor-info.entity';
import { RegisterDto } from './dto/register-user.dto';
import { Attachment } from 'src/modules/attachment/entities/attachment.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { JwtService } from '@nestjs/jwt';
import { LoginUserDto } from './dto/login-user.dto';
import { ValidationCode } from 'src/modules/validation-code/entities/validation-code.entity';
import { MailService } from 'src/modules/common/service/email.service';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';
import { UserService } from 'src/modules/user/user.service';
import { User } from '../user/entities/user.entity';
import { throwIfError } from 'src/utils/error-handler.util';

@Injectable()
export class AuthService {

    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(ValidationCode)
        private readonly validationCodeRepository: Repository<ValidationCode>,
        private readonly userService: UserService,
        private readonly mailService: MailService,
        private jwtService: JwtService,
        private readonly dataSource: DataSource
    ) { }

    async validateUser(email: string, pass: string, role: UserRoleEnum): Promise<any> {

        throwIfError(![UserRoleEnum.ADMIN, UserRoleEnum.USER, UserRoleEnum.VENDOR].includes(role), 'Role is incorrect.');

        const user = await this.userRepository.findOne({
            where: { email: email, role: role }
        });

        if (user && (await bcrypt.compare(pass, user.password))) {
            const { password, created_at, updated_at, ...result } = user;
            return result;
        }
        return null;
    }

    async login(loginUserDto: LoginUserDto) {

        const { email, password, role } = loginUserDto;

        const user = await this.validateUser(email, password, role);

        if (!user) {
            throwIfError(!user, 'Invalid credentials.');
        } else {
            const userInfo = await this.userService.findUserById(user.id);
            const payload = { email: user.email, role: user.role };
            return {
                user: userInfo,
                access_token: this.jwtService.sign(payload)
            };
        }
    }

    async logout(user: User) {
        return { message: 'Logged out successfully' };
    }

    async register(registerDto: RegisterDto): Promise<Omit<User, 'password'>> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const {
                user_name,
                email,
                password,
                role,
                attachment_id,
                country_id,
                validation_code_id,
                ...rest
            } = registerDto;

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = new User();
            user.user_name = user_name;
            user.email = email;
            user.password = hashedPassword;
            user.role = role;

            if (country_id) {
                const country = await queryRunner.manager.findOne(Country, { where: { id: country_id } });
                throwIfError(!country, 'Invalid country ID.');
                user.country = country;
            }

            const savedUser = await queryRunner.manager.save(user);
            let userProfile: UserProfile | null = null;
            // Handle User Profile for Regular Users
            if (role === UserRoleEnum.USER) {
                throwIfError(!rest.date_of_birth, 'Date of Birth is required.');

                userProfile = new UserProfile();
                userProfile.phone = rest.phone;
                userProfile.date_of_birth = rest.date_of_birth;
                userProfile.user = savedUser;
                userProfile.otp = Math.floor(1000 + Math.random() * 9000).toString();

                if (attachment_id) {
                    const attachment = await queryRunner.manager.findOne(Attachment, { where: { id: attachment_id } });
                    if (attachment) {
                        userProfile.attachment = attachment;
                    }
                }

                await queryRunner.manager.save(userProfile);
            }

            // Handle Vendor Info for Vendors
            if (role === UserRoleEnum.VENDOR) {
                throwIfError(!rest.primary_content, 'Primary content is required.');
                throwIfError(!attachment_id, 'Logo is required.');
                throwIfError(!rest.about_brand, 'About Brand is required.');

                const vendorInfo = new VendorInfo();
                vendorInfo.primary_content = rest?.primary_content;
                vendorInfo.phone = rest?.phone;
                vendorInfo.about_brand = rest?.about_brand;
                vendorInfo.website_url = rest?.website_url;
                vendorInfo.social_media = rest?.social_media;
                vendorInfo.other_links = rest?.other_links;
                vendorInfo.user = savedUser;

                if (validation_code_id) {
                    const validationCode = await queryRunner.manager.findOne(ValidationCode, {
                        where: { id: validation_code_id, is_deleted: false, is_used: false }
                    });
                    if (validationCode) {
                        vendorInfo.validationCode = validationCode;
                    }
                }
                if (attachment_id) {
                    const attachment = await queryRunner.manager.findOne(Attachment, { where: { id: attachment_id } });
                    throwIfError(!attachment, 'Invalid attachment ID.');
                    vendorInfo.attachment = attachment;
                }
                await queryRunner.manager.save(vendorInfo);
            }

            // Send verification or activation email
            const token = this.jwtService.sign({ email: user.email });
            if (savedUser.role !== UserRoleEnum.ADMIN) {
                try {
                    if (savedUser.role === UserRoleEnum.USER) {
                        await this.mailService.sendOtpEmail(registerDto.email, userProfile.otp);
                    } else {
                        await this.mailService.sendActivationEmail(registerDto.email, token);
                    }
                } catch (mailError) {
                    throwIfError(true, `Failed to send ${savedUser.role === UserRoleEnum.USER ? "OTP email" : "activation email"}. Please use a valid email.`, InternalServerErrorException);
                }
            }

            await queryRunner.commitTransaction();

            // Mark validation code as used, if applicable
            if (savedUser && validation_code_id) {
                await this.validationCodeRepository.update(validation_code_id, { is_used: true });
            }

            return this.userService.findUserById(savedUser.id);
        } catch (error) {
            await queryRunner.rollbackTransaction();

            if (error.detail && error.detail.includes('email')) {
                throw new ConflictException('Email is already in use.');
            } else if (error.detail && error.detail.includes('phone')) {
                throw new ConflictException('Phone number is already in use.');
            } else if (error.detail && error.detail.includes('Failed to send email')) {
                throw new InternalServerErrorException('Failed to send activation email, user registration failed.');
            } else if (error.code === '23505') {
                throw new BadRequestException('Duplicate entry detected. Please ensure that the provided information is unique.');
            } else {
                throw new InternalServerErrorException(`Failed to register user: ${error.message}`);
            }
        } finally {
            await queryRunner.release();
        }
    }

    async findOneByEmail(email: string): Promise<User> {
        return await this.userRepository.findOne({ where: { email } });
    }


}
