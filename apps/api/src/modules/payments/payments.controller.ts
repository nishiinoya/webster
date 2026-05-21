import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { PaymentsService, PaymentDto } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async getPayments(@CurrentUser() user: AuthUser): Promise<{ payments: PaymentDto[] }> {
    const payments = await this.paymentsService.findByUser(user.id);
    return { payments };
  }
}
