import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { IsUrl } from 'class-validator';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SubscriptionsService } from './subscriptions.service';
import { StartCheckoutDto } from './dto/start-checkout.dto';

class PortalDto {
  @IsUrl({ require_tld: false })
  returnUrl!: string;
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  getMySubscription(@CurrentUser() user: AuthUser) {
    return this.subscriptionsService.getMySubscription(user.id);
  }

  @Public()
  @Get('plans')
  getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Post('checkout')
  async createCheckoutSession(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartCheckoutDto,
  ) {
    return this.subscriptionsService.createCheckoutSession(user, dto);
  }

  @Post('portal')
  async createPortalSession(
    @CurrentUser() user: AuthUser,
    @Body() dto: PortalDto,
  ) {
    return this.subscriptionsService.createPortalSession(user, dto.returnUrl);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new UnauthorizedException('Missing Stripe signature header');
    }

    const rawBody = req.body as Buffer;

    await this.subscriptionsService.handleWebhookEvent(rawBody, signature);
    return { received: true };
  }
}
