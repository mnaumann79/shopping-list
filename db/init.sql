-- Initial schema for the perf-audit CI workflow.
-- Mirrors src/db/schema/{auth,households,items}.ts.
-- Applied via psql to the ephemeral Postgres service container.
-- If you add a new table or column, regenerate this file (or extend
-- src/db/migrations/ and apply it here in order).

CREATE TABLE "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "session" (
  "id" text PRIMARY KEY,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "active_organization_id" text
);

CREATE TABLE "account" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE "organization" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text UNIQUE,
  "logo" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "metadata" text
);

CREATE TABLE "member" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "invitation" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "categories_org_name_unique" UNIQUE ("organization_id", "name")
);

CREATE TABLE "stores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "quantity" text,
  "note" text,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_checked" boolean NOT NULL DEFAULT false,
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "created_by_id" text REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE TABLE "item_stores" (
  "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE
);

CREATE TABLE "household_join_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL UNIQUE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "created_by_id" text NOT NULL REFERENCES "user"("id"),
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
