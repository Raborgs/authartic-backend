import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionStatusService } from '../subscription/services/Subscription-status.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPlan } from '../subscription/entities/subscription-plan.entity';
import { SubscriptionStatus } from '../subscription/entities/subscription-status.entity';
import { SubscriptionPlanFeature } from '../subscription/entities/subscription-plan-feature.entity';
import { VendorInfo } from '../user/entities/vendor-info.entity';
import { Country } from '../country/entities/country.entity';
import { User } from '../user/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { StripeWebhookService } from './stripe-webhook.service';
import { UserService } from '../user/user.service';
import { UserProfile } from '../user/entities/user-profile.entity';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([SubscriptionPlan,SubscriptionStatus,UserProfile, SubscriptionPlanFeature, VendorInfo, User, Country]),
    AuthModule],
  controllers: [StripeController, StripeWebhookController],
  providers: [StripeService, SubscriptionStatusService, StripeWebhookService, UserService, JwtService],
})
export class StripeModule {}
