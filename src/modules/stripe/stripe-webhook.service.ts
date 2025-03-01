import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
  Injectable,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatusService } from '../subscription/services/Subscription-status.service';
import { UserService } from '../user/user.service';
import { throwIfError } from 'src/utils/error-handler.util';

@Injectable()
export class StripeWebhookService {
  private stripe: Stripe;
  private webhookSecret: string;
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private configService: ConfigService,
    private subscriptionStatusService: SubscriptionStatusService,
    private userService: UserService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-01-27.acacia',
      },
    );
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      return { error: 'Webhook verification failed' };
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.processCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'invoice.payment_succeeded':
        await this.processPaymentSuccess(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  private async processCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ) {
    const userEmail = session.customer_email;
    if (!userEmail) {
      return;
    }

    const user = await this.userService.findByEmail(userEmail);
    if (!user) {
      return;
    }

    const planId = session.metadata?.planId;
    if (!planId) {
      return;
    }

    await this.subscriptionStatusService.activatePlan(Number(planId), user);
  }

  private async processPaymentSuccess(invoice: Stripe.Invoice) {
    const customerEmail = invoice.customer_email;
    if (!customerEmail) {
      return;
    }

    const user = await this.userService.findByEmail(customerEmail);
    if (!user) {
      return;
    }
  }

  async verifyPayment(sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      throwIfError(!session, 'Invalid session ID.');

      if (session.payment_status === 'paid') {
        const user = await this.userService.findByEmail(session.customer_email);

        throwIfError(
          !user,
          'User not found for this payment.'
        );

        const planId = session.metadata?.planId;

        throwIfError(
          !planId,
          'Plan ID missing in session metadata.'
        );

        await this.subscriptionStatusService.activatePlan(Number(planId), user);

        this.logger.log(
          `Subscription Activated for User: ${user.email} with Plan ID: ${planId}`,
        );

        return {
          success: true,
          message: 'Payment verified. Subscription activated.',
        };
      } else {
        return { success: false, message: 'Payment not completed yet.' };
      }
    } catch (error) {
      this.logger.error(`Error verifying payment: ${error.message}`);
      throwIfError(error, 'Failed to verify payment');
    }
  }
}
