import { IsIn, IsUrl } from 'class-validator';

/**
 * Frontend sends `priceId: 'monthly' | 'yearly'` — the field name is kept for
 * backward compatibility with the existing client, but the value is now an
 * opaque plan key, not a Stripe price ID. The backend uses inline price_data
 * so no Stripe prices need to be pre-registered.
 */
export class StartCheckoutDto {
  @IsIn(['monthly', 'yearly'])
  priceId!: 'monthly' | 'yearly';

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}
