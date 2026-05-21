import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';

export interface StripePaymentSucceededPayload {
  userId: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  providerTxId: string;
}

export interface PaymentDto {
  id: string;
  amount: string;
  currency: string;
  providerTxId: string;
  createdAt: Date;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('stripe.payment.succeeded')
  async handlePaymentSucceeded(payload: StripePaymentSucceededPayload): Promise<void> {
    const { userId, subscriptionId, amount, currency, providerTxId } = payload;
    try {
      await this.prisma.payment.create({
        data: {
          userId,
          subscriptionId: subscriptionId ?? null,
          amount,
          currency,
          providerTxId,
        },
      });
      this.logger.log(`Payment recorded: ${providerTxId} for user ${userId}`);
    } catch (err) {
      this.logger.error(`Failed to record payment ${providerTxId}: ${(err as Error).message}`);
    }
  }

  async findByUser(userId: string): Promise<PaymentDto[]> {
    const rows = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        providerTxId: true,
        createdAt: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      amount: r.amount.toString(),
      currency: r.currency,
      providerTxId: r.providerTxId,
      createdAt: r.createdAt,
    }));
  }
}
