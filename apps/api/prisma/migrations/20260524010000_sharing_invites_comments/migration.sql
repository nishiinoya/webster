-- CreateEnum
CREATE TYPE "project_invite_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "project_link_access_mode" AS ENUM ('restricted', 'anyone_with_link');

-- CreateEnum
CREATE TYPE "project_comment_status" AS ENUM ('open', 'resolved');

-- AlterTable
ALTER TABLE "project_accesses"
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revoked_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "project_comments"
  ADD COLUMN "layer_id" VARCHAR,
  ADD COLUMN "local_x" DECIMAL(12,4),
  ADD COLUMN "local_y" DECIMAL(12,4),
  ADD COLUMN "status" "project_comment_status" NOT NULL DEFAULT 'open',
  ADD COLUMN "deleted_at" TIMESTAMPTZ;

UPDATE "project_comments"
SET "status" = CASE WHEN "is_resolved" THEN 'resolved'::"project_comment_status" ELSE 'open'::"project_comment_status" END,
    "deleted_at" = CASE WHEN "is_deleted" THEN "updated_at" ELSE NULL END;

-- CreateTable
CREATE TABLE "project_invites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "invited_email" VARCHAR,
  "invited_by_user_id" UUID NOT NULL,
  "permission" "permission_level" NOT NULL DEFAULT 'viewer',
  "token_hash" VARCHAR NOT NULL,
  "status" "project_invite_status" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ,
  "accepted_by_user_id" UUID,
  "accepted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_link_access" (
  "project_id" UUID NOT NULL,
  "mode" "project_link_access_mode" NOT NULL DEFAULT 'restricted',
  "permission" "permission_level" NOT NULL DEFAULT 'viewer',
  "token_hash" VARCHAR,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_link_access_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "project_accesses_project_id_shared_with_user_id_idx" ON "project_accesses"("project_id", "shared_with_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_invites_token_hash_key" ON "project_invites"("token_hash");

-- CreateIndex
CREATE INDEX "project_invites_project_id_status_idx" ON "project_invites"("project_id", "status");

-- CreateIndex
CREATE INDEX "project_invites_invited_email_status_idx" ON "project_invites"("invited_email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_link_access_token_hash_key" ON "project_link_access"("token_hash");

-- CreateIndex
CREATE INDEX "project_comments_project_id_status_idx" ON "project_comments"("project_id", "status");

-- CreateIndex
CREATE INDEX "project_comments_parent_comment_id_idx" ON "project_comments"("parent_comment_id");

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_link_access" ADD CONSTRAINT "project_link_access_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
