import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type PlanTier = 'free' | 'pro';

export interface EntitlementLimits {
  maxProjects: number | null;
  maxSharesPerProject: number | null;
  allow3D: boolean;
}

export interface EntitlementSnapshot {
  plan: PlanTier;
  isPro: boolean;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  limits: EntitlementLimits;
  usage: { projectCount: number };
}

type SubscriptionLike = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
} | null;

@Injectable()
export class EntitlementsService {
  private readonly freeMaxProjects: number;
  private readonly freeMaxShares: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.freeMaxProjects = config.get<number>('limits.freeMaxProjects') ?? 3;
    this.freeMaxShares =
      config.get<number>('limits.freeMaxSharesPerProject') ?? 3;
  }

  async isPro(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { status: true, currentPeriodEnd: true },
    });
    return this.subscriptionIsPro(sub);
  }

  private subscriptionIsPro(sub: SubscriptionLike): boolean {
    if (!sub) return false;
    const active =
      sub.status === SubscriptionStatus.active ||
      sub.status === SubscriptionStatus.trialing;
    if (!active) return false;
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) {
      return false;
    }
    return true;
  }

  limitsFor(isPro: boolean): EntitlementLimits {
    return isPro
      ? { maxProjects: null, maxSharesPerProject: null, allow3D: true }
      : {
          maxProjects: this.freeMaxProjects,
          maxSharesPerProject: this.freeMaxShares,
          allow3D: false,
        };
  }

  async getSnapshot(userId: string): Promise<EntitlementSnapshot> {
    const [sub, projectCount] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { userId },
        select: { status: true, currentPeriodEnd: true },
      }),
      this.prisma.project.count({
        where: { ownerId: userId, isDeleted: false },
      }),
    ]);

    const isPro = this.subscriptionIsPro(sub);

    return {
      plan: isPro ? 'pro' : 'free',
      isPro,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      limits: this.limitsFor(isPro),
      usage: { projectCount },
    };
  }

  async assertCanCreateProject(userId: string): Promise<void> {
    if (await this.isPro(userId)) return;

    const count = await this.prisma.project.count({
      where: { ownerId: userId, isDeleted: false },
    });

    if (count >= this.freeMaxProjects) {
      throw new HttpException(
        {
          code: 'free_tier_limit_projects',
          message: `Free plan is limited to ${this.freeMaxProjects} projects. Upgrade to Pro for unlimited projects.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async assertCanShareProject(
    projectId: string,
    ownerId: string,
  ): Promise<void> {
    if (await this.isPro(ownerId)) return;

    const [accessCount, inviteCount] = await Promise.all([
      this.prisma.projectAccess.count({
        where: { projectId, revokedAt: null, sharedWithUserId: { not: null } },
      }),
      this.prisma.projectInvite.count({
        where: { projectId, status: 'pending' },
      }),
    ]);

    if (accessCount + inviteCount >= this.freeMaxShares) {
      throw new HttpException(
        {
          code: 'free_tier_limit_shares',
          message: `Free plan is limited to ${this.freeMaxShares} collaborators per project. Upgrade to Pro to share with more people.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async assertManifest3DAllowed(
    userId: string,
    manifest: unknown,
  ): Promise<void> {
    if (!manifestUsesObject3D(manifest)) return;
    if (await this.isPro(userId)) return;

    throw new HttpException(
      {
        code: 'free_tier_limit_3d',
        message:
          '3D models are a Pro feature. Upgrade to Pro to add 3D models to your projects.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

export function manifestUsesObject3D(manifest: unknown): boolean {
  if (!manifest || typeof manifest !== 'object') return false;
  return layersContainObject3D((manifest as { layers?: unknown }).layers);
}

function layersContainObject3D(layers: unknown): boolean {
  if (!Array.isArray(layers)) return false;

  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    const rec = layer as Record<string, unknown>;
    if (rec.type === 'object3d') return true;
    if (layersContainObject3D(rec.children)) return true;
    if (layersContainObject3D(rec.layers)) return true;
  }

  return false;
}
