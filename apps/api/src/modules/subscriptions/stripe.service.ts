import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type PlanInterval = 'month' | 'year';

export interface PlanInfo {
  /** Stable client key — 'monthly' / 'yearly'. NOT a Stripe price ID. */
  priceId: PlanKey;
  interval: PlanInterval;
  amount: number;
  currency: string;
  productName: string;
}

export type PlanKey = 'monthly' | 'yearly';

/**
 * Stripe Checkout supports `price_data` inline — no pre-created Product or Price
 * is needed. We describe the plan in our own config and pass it at session
 * creation time; Stripe creates the underlying objects automatically. That
 * removes the dashboard-setup step at the cost of letting the *app* be the
 * source of truth for plan amounts (which is fine for a demo).
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private readonly logger = new Logger(StripeService.name);
  private stripe?: Stripe;

  readonly webhookSecret: string;
  readonly productName: string;
  readonly currency: string;
  readonly monthlyAmountCents: number;
  readonly yearlyAmountCents: number;

  constructor(private readonly config: ConfigService) {
    this.webhookSecret = this.config.get<string>('stripe.webhookSecret') ?? '';
    this.productName = this.config.get<string>('stripe.productName') ?? 'Webster Pro';
    this.currency = (this.config.get<string>('stripe.currency') ?? 'usd').toLowerCase();
    this.monthlyAmountCents = this.config.get<number>('stripe.monthlyAmountCents') ?? 999;
    this.yearlyAmountCents = this.config.get<number>('stripe.yearlyAmountCents') ?? 9900;
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
    this.logger.log('Stripe client initialized (inline price_data mode)');
  }

  get client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return this.stripe;
  }

  isConfigured(): boolean {
    return Boolean(this.stripe);
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  amountCentsFor(plan: PlanKey): number {
    return plan === 'yearly' ? this.yearlyAmountCents : this.monthlyAmountCents;
  }

  async createCheckoutSession(params: {
    plan: PlanKey;
    successUrl: string;
    cancelUrl: string;
    userId: string;
    customerId?: string;
  }): Promise<Stripe.Checkout.Session> {
    const interval: PlanInterval = params.plan === 'yearly' ? 'year' : 'month';

    return this.client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: this.currency,
            unit_amount: this.amountCentsFor(params.plan),
            recurring: { interval },
            // Pass product_data so the line item still shows a friendly name on
            // the hosted checkout page and the customer's invoice/receipt.
            product_data: { name: this.productName },
          },
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      allow_promotion_codes: true,
      ...(params.customerId ? { customer: params.customerId } : {}),
    });
  }

  /**
   * Returns the inline plan catalogue. No network call — plans are defined in
   * config. Returns [] only when Stripe itself isn't configured, so the
   * frontend's "Billing isn't configured yet" path still works.
   */
  getPlans(): { plans: PlanInfo[] } {
    if (!this.isConfigured()) {
      return { plans: [] };
    }

    return {
      plans: [
        {
          priceId: 'monthly',
          interval: 'month',
          amount: this.monthlyAmountCents / 100,
          currency: this.currency,
          productName: this.productName,
        },
        {
          priceId: 'yearly',
          interval: 'year',
          amount: this.yearlyAmountCents / 100,
          currency: this.currency,
          productName: this.productName,
        },
      ],
    };
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
