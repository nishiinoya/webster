import { IsString, IsUrl } from 'class-validator';

export class StartCheckoutDto {
  @IsString()
  priceId!: string;

  @IsUrl()
  successUrl!: string;

  @IsUrl()
  cancelUrl!: string;
}
