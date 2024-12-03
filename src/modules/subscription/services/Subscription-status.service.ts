import {
    Injectable,
    BadRequestException,
    ForbiddenException,
    UnauthorizedException,
    NotFoundException,
    forwardRef,
    Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserRoleEnum } from 'src/modules/user/enum/user.role.enum';
import { SubscriptionStatus } from '../entities/subscription-status.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SubscriptionPlanFeature } from '../entities/subscription-plan-feature.entity';
import { UpdateSubscriptionStatusDto } from '../dto/update-subscription-status.dto';
import { CreateSubscriptionStatusDto } from '../dto/create-subscription-status.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { throwIfError } from 'src/utils/error-handler.util';
import { VendorInfo } from 'src/modules/user/entities/vendor-info.entity';
import { UserService } from 'src/modules/user/user.service';

@Injectable()
export class SubscriptionStatusService {
    constructor(
        @InjectRepository(SubscriptionStatus)
        private readonly subscriptionStatusRepository: Repository<SubscriptionStatus>,
        @InjectRepository(SubscriptionPlan)
        private readonly subscriptionPlanRepository: Repository<SubscriptionPlan>,
        @InjectRepository(VendorInfo)
        private readonly vendorInfoRepository: Repository<VendorInfo>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        // private readonly userService: UserService, 
        @Inject(forwardRef(() => UserService))  // Break circular dependency here
        private readonly userService: UserService,
        private readonly dataSource: DataSource,
    ) { }

    async activatePlan(subscriptionPlanId: number, user: User): Promise<any> {

        throwIfError(!subscriptionPlanId, 'Subscription ID is required.');
        throwIfError(!user, 'User token is required.', UnauthorizedException);
        throwIfError((user.role !== UserRoleEnum.VENDOR), 'Only vendors can activate subscription plans.', ForbiddenException);
    
        const isUser = await this.userRepository.findOne({ where: { id: user.id } });
        throwIfError(!isUser, 'User not found.', NotFoundException);
    
        const vendorInfo = await this.vendorInfoRepository.findOne({ where: { user: { id: user.id } } });
        throwIfError(!vendorInfo, 'Vendor info not found.', NotFoundException);
        throwIfError(!vendorInfo.is_verified_email, 'Please verify your email first. We have sent an activation email to your email address.');
    
        const subscriptionPlan = await this.subscriptionPlanRepository.findOne({
            where: { id: subscriptionPlanId },
            relations: ['subscriptionPlanFeatures'],
        });
        throwIfError(!subscriptionPlan, 'Subscription plan not found.', NotFoundException);
    
        const feature = subscriptionPlan.subscriptionPlanFeatures.find(
            (feature) => feature.name === 'Free Monthly Certificates'
        );
        throwIfError(!feature, 'Feature "Free Monthly Certificates" not found.', NotFoundException);
    
        const numberOfCertificates = feature.value ? parseInt(feature.value, 10) : 0;
    
        const userDetails = await this.userService.findUserById(user.id);
        
        throwIfError(!userDetails.validation_code, 'Your account is not verified by admin. Please contact the admin.', UnauthorizedException);
    
        let subscriptionStatus = await this.subscriptionStatusRepository.findOne({
            where: { user: { id: user.id } },
        });
    
        const createSubscriptionStatusDto = new CreateSubscriptionStatusDto();
        createSubscriptionStatusDto.total_certificates_issued = (subscriptionStatus?.total_certificates_issued || 0);
        createSubscriptionStatusDto.remaining_certificates = numberOfCertificates;
        createSubscriptionStatusDto.plan_activated_date = new Date();
        createSubscriptionStatusDto.plan_expiry_date = new Date(new Date().setDate(new Date().getDate() + 30));
        createSubscriptionStatusDto.is_expired = createSubscriptionStatusDto.plan_expiry_date < new Date();
        createSubscriptionStatusDto.subscriptionPlan = subscriptionPlan;
    
        if (subscriptionStatus) {
            subscriptionStatus.total_certificates_issued = subscriptionStatus.total_certificates_issued;
            subscriptionStatus.remaining_certificates = numberOfCertificates;
            subscriptionStatus.plan_activated_date = new Date();
            subscriptionStatus.plan_expiry_date = new Date(new Date().setDate(new Date().getDate() + 30));
            subscriptionStatus.additional_cost = 0;
            subscriptionStatus.is_expired = false;
            subscriptionStatus.subscriptionPlan = subscriptionPlan;
            await this.subscriptionStatusRepository.save(subscriptionStatus);
        } else {
            subscriptionStatus = this.subscriptionStatusRepository.create({
                ...createSubscriptionStatusDto,
                user: userDetails,
            });
    
            await this.dataSource.transaction(async (entityManager: EntityManager) => {
                subscriptionStatus = await entityManager.save(SubscriptionStatus, subscriptionStatus);
            });
        }
    
        // Refetch the user with updated relationships to return the subscription status details
        const updatedUser = await this.userService.findUserById(user.id);
        
        return updatedUser;
    }
    
    async updateSubscriptionStatus(subscriptionStatusId: number, certificatesToIssue: number, updateSubscriptionStatusDto: UpdateSubscriptionStatusDto): Promise<SubscriptionStatus> {


        const subscriptionStatus = await this.subscriptionStatusRepository.findOne({
            where: { id: subscriptionStatusId },
        });

        throwIfError(!subscriptionStatus, 'Subscription status not found.', NotFoundException)


        await this.isRemainingCertificates(subscriptionStatusId, certificatesToIssue);

        subscriptionStatus.total_certificates_issued = updateSubscriptionStatusDto.total_certificates_issued ?? subscriptionStatus.total_certificates_issued;
        subscriptionStatus.remaining_certificates = updateSubscriptionStatusDto.remaining_certificates ?? subscriptionStatus.remaining_certificates;
        subscriptionStatus.plan_activated_date = updateSubscriptionStatusDto.plan_activated_date ?? subscriptionStatus.plan_activated_date;
        subscriptionStatus.additional_feature_status = updateSubscriptionStatusDto.additional_feature_status ?? subscriptionStatus.additional_feature_status;
        subscriptionStatus.additional_cost = updateSubscriptionStatusDto.additional_cost ?? subscriptionStatus.additional_cost;
        subscriptionStatus.subscriptionPlan = updateSubscriptionStatusDto.subscriptionPlan ?? subscriptionStatus.subscriptionPlan;

        return this.subscriptionStatusRepository.save(subscriptionStatus);
    }

    async isRemainingCertificates(subscriptionStatusId: number, certificatesToIssue: number): Promise<any> {
        const subscriptionStatus = await this.subscriptionStatusRepository.findOne({
            where: { id: subscriptionStatusId },
        });

        throwIfError(!subscriptionStatus, 'Subscription status not found.', NotFoundException)

        throwIfError((subscriptionStatus.remaining_certificates <= 0), 'You don\'t have remaining certificates, save in draft or upgrade plan.', BadRequestException)

        const remainingCertificates = subscriptionStatus?.remaining_certificates;

        throwIfError(((subscriptionStatus.remaining_certificates - certificatesToIssue) < 0), `You have only ${remainingCertificates} certificate${remainingCertificates === 1 ? '' : 's'}.`)

        subscriptionStatus.remaining_certificates -= certificatesToIssue;

        return await this.subscriptionStatusRepository.save(subscriptionStatus);
    }


    // @Cron('*/1 * * * *')
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleCron() {
        const now = new Date();
        const subscriptionStatuses = await this.subscriptionStatusRepository.find({
            where: {
                is_expired: false,
            },
        });

        if (subscriptionStatuses) {
            for (const status of subscriptionStatuses) {
                const planExpiryDate = new Date(status.plan_expiry_date);
                if (planExpiryDate < now && !status.is_expired) {
                    status.is_expired = true;
                    try {
                        await this.subscriptionStatusRepository.save(status);
                    } catch (error) {
                        console.error(`Failed to update is_expired for status ID: ${status.id}:`, error);
                    }
                }
            }
        }
    }
    
    // Add the findByUserId method here
    async findByUserId(userId: number): Promise<SubscriptionStatus | null> {
        return await this.subscriptionStatusRepository.findOne({
            where: { user: { id: userId } },
            relations: ['subscriptionPlan', 'subscriptionPlan.subscriptionPlanFeatures'],
        });
    }

}
