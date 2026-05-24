export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
  database: {
    url: process.env.DATABASE_URL,
  },
  auth0: {
    domain: process.env.AUTH0_DOMAIN ?? '',
    audience: process.env.AUTH0_AUDIENCE ?? '',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'webster',
    accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    // Inline plan definition — no Stripe product/price needs to exist; we pass
    // price_data at checkout time and Stripe creates everything on the fly.
    productName: process.env.STRIPE_PRODUCT_NAME ?? 'Webster Pro',
    currency: (process.env.STRIPE_CURRENCY ?? 'usd').toLowerCase(),
    monthlyAmountCents: parseInt(
      process.env.STRIPE_MONTHLY_AMOUNT_CENTS ?? '999',
      10,
    ),
    yearlyAmountCents: parseInt(
      process.env.STRIPE_YEARLY_AMOUNT_CENTS ?? '9900',
      10,
    ),
  },
  limits: {
    freeMaxProjects: parseInt(process.env.FREE_MAX_PROJECTS ?? '3', 10),
    freeMaxSharesPerProject: parseInt(
      process.env.FREE_MAX_SHARES_PER_PROJECT ?? '3',
      10,
    ),
  },
});
