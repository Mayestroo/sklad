-- D3: sign-up by email confirmation. Additive and idempotent.
-- Pending sign-ups are not tenant data (no tenant exists yet).
CREATE TABLE IF NOT EXISTS "pending_registrations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company_slug" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_registrations_token_hash_key"
    ON "pending_registrations"("token_hash");

CREATE INDEX IF NOT EXISTS "pending_registrations_email_idx"
    ON "pending_registrations"("email");

CREATE INDEX IF NOT EXISTS "pending_registrations_expires_at_idx"
    ON "pending_registrations"("expires_at");
