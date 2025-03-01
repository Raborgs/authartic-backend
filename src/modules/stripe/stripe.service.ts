import { Injectable, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatusService } from '../subscription/services/Subscription-status.service';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { throwIfError } from 'src/utils/error-handler.util';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private readonly subscriptionStatusService: SubscriptionStatusService,
    private userService: UserService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    throwIfError(!stripeKey, 'Stripe API key is missing! Check your .env file.')

    this.stripe = new Stripe(stripeKey, { apiVersion: '2025-01-27.acacia' });
  }

  async createCheckoutSession(planId: number, user: User) {
    let priceId: string;

    if (planId === 1) {
      priceId = this.configService.get<string>('STRIPE_STARTER_PRICE_ID');
    } else if (planId === 2) {
      priceId = this.configService.get<string>('STRIPE_STANDARD_PRICE_ID');
    } else if (planId === 3) {
      priceId = this.configService.get<string>('STRIPE_PRO_PRICE_ID');
    } else {
      throw new Error('Invalid plan selected.');

    }

    throwIfError(!priceId, 'Missing Stripe Price ID. Check your .env file.')

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
//    success_url: `${process.env.FRONTEND_URL}/home`,
//    cancel_url: `${process.env.FRONTEND_URL}/home`,
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      metadata: {
        planId: planId.toString(),
      },
    });

    return { checkoutUrl: session.url };
  }

  async verifyPayment(sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      throwIfError(!session, 'Invalid session ID')
      if (session.payment_status === 'paid') {
        const user = await this.userService.findByEmail(session.customer_email);

        throwIfError(!user, 'User not found for this payment')
        const planId = session.metadata?.planId;

        throwIfError(!planId, 'Plan ID missing in session metadata')

        await this.subscriptionStatusService.activatePlan(Number(planId), user);


        return { success: true, message: 'Payment verified. Subscription activated.' };
      } else {
        return { success: false, message: 'Payment not completed yet.' };
      }
    } catch (error) {
      throwIfError(error, 'Failed to verify payment')
    }
  }
}
