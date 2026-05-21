-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'canceled', 'past_due', 'trialing');

-- CreateEnum
CREATE TYPE "permission_level" AS ENUM ('viewer', 'editor', 'commenter');

-- CreateEnum
CREATE TYPE "asset_type" AS ENUM ('image', 'vector', 'font', 'audio', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth0_subject" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "display_name" VARCHAR,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'trialing',
    "provider_sub_id" VARCHAR,
    "current_period_end" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "subscription_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "provider_tx_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "project_name" VARCHAR NOT NULL,
    "storage_key" VARCHAR NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "mime_type" VARCHAR NOT NULL DEFAULT 'image/png',
    "metadata" JSONB,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "asset_name" VARCHAR NOT NULL,
    "type" "asset_type" NOT NULL DEFAULT 'image',
    "storage_key" VARCHAR NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "mime_type" VARCHAR,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "snapshot_name" VARCHAR,
    "state_data" JSONB,
    "thumbnail_storage_key" VARCHAR,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_accesses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "shared_with_user_id" UUID,
    "permission" "permission_level" NOT NULL DEFAULT 'viewer',
    "expires_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "x_coordinate" DECIMAL(8,4),
    "y_coordinate" DECIMAL(8,4),
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ,
    "resolved_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth0_subject_key" ON "users"("auth0_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_sub_id_key" ON "subscriptions"("provider_sub_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_tx_id_key" ON "payments"("provider_tx_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_assets_project_id_storage_key_key" ON "project_assets"("project_id", "storage_key");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_accesses" ADD CONSTRAINT "project_accesses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_accesses" ADD CONSTRAINT "project_accesses_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_accesses" ADD CONSTRAINT "project_accesses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "project_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
