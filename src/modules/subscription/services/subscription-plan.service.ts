import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { CreateSubscriptionPlanDto } from '../dto/create-subscription-plan.dto';
import { GetSubscriptionPlanDto } from '../dto/get-subscription-plan.dto';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { throwIfError } from 'src/utils/error-handler.util';

@Injectable()
export class SubscriptionPlanService {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private readonly subscriptionPlanRepository: Repository<SubscriptionPlan>,
  ) { }
  async create(createSubscriptionPlanDto: CreateSubscriptionPlanDto) {
    const subscriptionPlan = this.subscriptionPlanRepository.create(createSubscriptionPlanDto);
    return this.subscriptionPlanRepository.save(subscriptionPlan);
  }

  async findAll(): Promise<GetSubscriptionPlanDto[]> {
    const subscriptionPlans = await this.subscriptionPlanRepository.find({
      relations: ['subscriptionPlanFeatures'],
    });

    return plainToInstance(GetSubscriptionPlanDto, subscriptionPlans, {
      excludeExtraneousValues: true,
    });
  }
  async findOneById(id: number): Promise<GetSubscriptionPlanDto> {
  
    throwIfError(!id, 'Subscription ID is required.')
    const subscriptionPlan = await this.subscriptionPlanRepository.findOne({
      where: { id },
      relations: ['subscriptionPlanFeatures'],
    });
    
    throwIfError(!subscriptionPlan, 'Subscription plan not found.', NotFoundException)
    
    return plainToInstance(GetSubscriptionPlanDto, subscriptionPlan, {
      excludeExtraneousValues: true,
    });
  }
}