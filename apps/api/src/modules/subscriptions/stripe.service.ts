import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripe?: Stripe;

  readonly priceProMonthly: string;
  readonly priceProYearly: string;
  readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.priceProMonthly = this.config.get<string>('stripe.priceProMonthly') ?? '';
    this.priceProYearly = this.config.get<string>('stripe.priceProYearly') ?? '';
    this.webhookSecret = this.config.get<string>('stripe.webhookSecret') ?? '';
  }

  onModuleInit() {
    const secretKey = this.config.get<string>('stripe.secretKey') ?? '';
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not set — Stripe features disabled');
      return;
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia',
    });
    this.logger.log('Stripe client initialized');
  }

  get client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return this.stripe;
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  async createCheckoutSession(params: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    userId: string;
    customerId?: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      ...(params.customerId ? { customer: params.customerId } : {}),
    });
  }

  async createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    return this.client.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
  }
}
