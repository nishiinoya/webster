import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ValidationPipe } from '@nestjs/common';

import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Module stubs — Phase 1 agents will fill these in
import { HealthController } from './health.controller';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SharedProjectsModule } from './modules/shared-projects/shared-projects.module';
import { AssetsModule } from './modules/assets/assets.module';
import { SnapshotsModule } from './modules/snapshots/snapshots.module';
import { AccessesModule } from './modules/accesses/accesses.module';
import { CommentsModule } from './modules/comments/comments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { StorageModule } from './modules/storage/storage.module';
import { WebsterModule } from './modules/webster/webster.module';
import { CollaborationModule } from './modules/collaboration/collaboration.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    // Feature modules
    UsersModule,
    ProjectsModule,
    SharedProjectsModule,
    AssetsModule,
    SnapshotsModule,
    AccessesModule,
    CommentsModule,
    SubscriptionsModule,
    PaymentsModule,
    StorageModule,
    WebsterModule,
    CollaborationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ transform: true, whitelist: true }),
    },
  ],
})
export class AppModule {}
