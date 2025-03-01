import { Controller, UseGuards, Post,Param, Body } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../user/entities/user.entity';
import { throwIfError } from 'src/utils/error-handler.util';

@UseGuards(AuthGuard('jwt'))
@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('create-checkout-session/:id')
  async createCheckoutSession(@Param('id') id: string, @GetUser() user: User ) {
    return this.stripeService.createCheckoutSession(Number(id), user);
  }

  @Post('verify-payment')
  async verifyPayment(@Body('session_id') sessionId: string) {
      throwIfError(!sessionId, "Session ID is required");
    return this.stripeService.verifyPayment(sessionId);
  }
}
