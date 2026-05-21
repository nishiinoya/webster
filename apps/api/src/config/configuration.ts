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
    priceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    priceProYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
  },
});
