import { Controller, Post, Req, Headers, Logger } from '@nestjs/common';
import { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service';

@Controller('stripe/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private stripeWebhookService: StripeWebhookService) {}

  @Post()
  async handleWebhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    const rawBody = req.body as Buffer; 

    if (!rawBody) {
      // this.logger.error('Raw body is missing');
      return { error: 'Webhook payload missing raw body' };
    }

    return this.stripeWebhookService.handleStripeWebhook(rawBody, signature);
  }
}
