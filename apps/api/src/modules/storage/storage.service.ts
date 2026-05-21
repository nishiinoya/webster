import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const s3Config = this.config.get('s3');
    this.bucket = s3Config.bucket;

    this.s3 = new S3Client({
      endpoint: s3Config.endpoint,
      region: s3Config.region,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.accessKey,
        secretAccessKey: s3Config.secretKey,
      },
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket "${this.bucket}" already exists`);
    } catch (err: unknown) {
      const httpStatus = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (httpStatus === 404 || httpStatus === 403) {
        try {
          await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Created S3 bucket "${this.bucket}"`);
        } catch (createErr) {
          this.logger.warn(`Could not create S3 bucket: ${(createErr as Error).message}`);
        }
      } else {
        this.logger.warn(`Could not verify S3 bucket: ${(err as Error).message}`);
      }
    }
  }

  async putObject(
    key: string,
    body: Buffer | Readable,
    mimeType: string,
  ): Promise<{ key: string; size: number }> {
    let buffer: Buffer;

    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      buffer = Buffer.concat(chunks);
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
      }),
    );

    return { key, size: buffer.length };
  }

  async getObject(key: string): Promise<{ body: Readable; mimeType: string; size: number }> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const body = response.Body as Readable;
    const mimeType = response.ContentType ?? 'application/octet-stream';
    const size = response.ContentLength ?? 0;

    return { body, mimeType, size };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  buildKey(...parts: string[]): string {
    return parts
      .map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
  }
}
