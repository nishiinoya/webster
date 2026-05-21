import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from './stripe.service';
import { StartCheckoutDto } from './dto/start-checkout.dto';
import { AuthUser } from '../../common/types/auth-user';
import { Subscription, SubscriptionStatus } from '@prisma/client';

export interface StripePaymentSucceededPayload {
  userId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  providerTxId: string;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getMySubscription(userId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findUnique({ where: { userId } });
  }

  async createCheckoutSession(
    user: AuthUser,
    dto: StartCheckoutDto,
  ): Promise<{ url: string }> {
    const { priceProMonthly, priceProYearly } = this.stripeService;

    if (dto.priceId !== priceProMonthly && dto.priceId !== priceProYearly) {
      throw new BadRequestException(
        `Invalid priceId. Must be one of the configured pro plan price IDs.`,
      );
    }

    // Resolve existing Stripe customer if we have a subscription row
    const existingSub = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    const session = await this.stripeService.createCheckoutSession({
      priceId: dto.priceId,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      userId: user.id,
      customerId: existingSub?.providerSubId
        ? undefined // providerSubId is the subscription ID, not customer ID — skip for now
        : undefined,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return { url: session.url };
  }

  async createPortalSession(
    user: AuthUser,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!sub?.providerSubId) {
      throw new NotFoundException('No active subscription found for this user');
    }

    // Retrieve the Stripe subscription to get the customer ID
    const stripeSub = await this.stripeService.client.subscriptions.retrieve(
      sub.providerSubId,
    );
    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer.id;

    const session = await this.stripeService.createBillingPortalSession({
      customerId,
      returnUrl,
    });

    return { url: session.url };
  }

  async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook signature verification failed: ${message}`);
      throw err;
    }

    this.logger.debug(`Handling Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private handlers
  // ---------------------------------------------------------------------------

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.client_reference_id;
    if (!userId) {
      this.logger.warn('checkout.session.completed missing client_reference_id');
      return;
    }

    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id ?? null;

    if (!stripeSubscriptionId) {
      this.logger.warn('checkout.session.completed has no subscription ID');
      return;
    }

    // Fetch the full subscription to get period end and status
    const stripeSub =
      await this.stripeService.client.subscriptions.retrieve(
        stripeSubscriptionId,
      );

    const status = this.mapStripeStatus(stripeSub.status);
    const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);

    await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        providerSubId: stripeSubscriptionId,
        status,
        currentPeriodEnd,
      },
      update: {
        providerSubId: stripeSubscriptionId,
        status,
        currentPeriodEnd,
      },
    });

    this.logger.log(
      `Subscription upserted for user ${userId}: ${stripeSubscriptionId}`,
    );
  }

  private async handleSubscriptionUpdated(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const status = this.mapStripeStatus(stripeSub.status);
    const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);

    const updated = await this.prisma.subscription.updateMany({
      where: { providerSubId: stripeSub.id },
      data: { status, currentPeriodEnd },
    });

    if (updated.count === 0) {
      this.logger.warn(
        `customer.subscription.updated: no local row for ${stripeSub.id}`,
      );
    }
  }

  private async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    const updated = await this.prisma.subscription.updateMany({
      where: { providerSubId: stripeSub.id },
      data: { status: SubscriptionStatus.canceled },
    });

    if (updated.count === 0) {
      this.logger.warn(
        `customer.subscription.deleted: no local row for ${stripeSub.id}`,
      );
    }
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    // Resolve userId via subscription
    const stripeSubId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : (invoice.subscription as Stripe.Subscription | null)?.id ?? null;

    if (!stripeSubId) {
      this.logger.warn('invoice.paid: no subscription on invoice');
      return;
    }

    const localSub = await this.prisma.subscription.findUnique({
      where: { providerSubId: stripeSubId },
    });

    if (!localSub) {
      this.logger.warn(
        `invoice.paid: no local subscription row for ${stripeSubId}`,
      );
      return;
    }

    const payload: StripePaymentSucceededPayload = {
      userId: localSub.userId,
      subscriptionId: localSub.id,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      providerTxId:
        typeof invoice.payment_intent === 'string'
          ? invoice.payment_intent
          : (invoice.payment_intent as Stripe.PaymentIntent | null)?.id ?? '',
    };

    this.eventEmitter.emit('stripe.payment.succeeded', payload);
    this.logger.log(
      `Emitted stripe.payment.succeeded for user ${localSub.userId}`,
    );
  }

  private mapStripeStatus(
    stripeStatus: Stripe.Subscription.Status,
  ): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
        return SubscriptionStatus.active;
      case 'canceled':
        return SubscriptionStatus.canceled;
      case 'past_due':
        return SubscriptionStatus.past_due;
      case 'trialing':
        return SubscriptionStatus.trialing;
      default:
        return SubscriptionStatus.active;
    }
  }
}
