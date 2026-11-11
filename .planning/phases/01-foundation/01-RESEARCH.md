# Phase 1: Foundation - Research

**Researched:** 2026-03-11
**Domain:** Authentication, Household Multi-Tenancy, Invite Flows — Next.js App Router
**Confidence:** HIGH (core stack), MEDIUM (shareable join link pattern)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Framework**: Next.js (App Router)
- **Auth library**: better-auth — email/password + sessions, self-hosted, no vendor lock-in
- **Database**: PostgreSQL (Neon) + Drizzle ORM
- **Deployment**: Vercel (app) + Neon Postgres (database)
- **Styling**: Tailwind CSS + shadcn/ui — use shadcn components for forms, dialogs, buttons
- **Email**: Resend + React Email for transactional emails (invite emails)
- **Onboarding**: Signup forces household creation — every user must belong to a household before seeing the app
- **Household creation step**: Name only (one field) — no wizard
- **Invite via link**: Signup → auto-join household (invite context preserved through signup)
- **Users can belong to multiple households**: Household switcher required from day one
- **Household switcher**: Lives in header/nav — dropdown showing current household name
- **Both invite mechanisms**: Email invite (HSHD-02) and shareable join link (HSHD-03) supported
- **Join links**: Expire after 7 days; admin can regenerate; multi-use
- **Existing logged-in user + invite link**: Auto-join immediately (no extra confirmation)
- **New user + invite link**: Signup → auto-join (context preserved through flow)
- **Admin can remove members; any member can leave**
- **Departed member's items**: Stay on the list (items belong to household, not user)
- **Admin leaves**: Auto-promote longest-standing remaining member
- **Sessions**: 30-day sliding, no "remember me" checkbox, always persistent
- **Session expiry**: Redirect to login, return to original URL
- **No v1 session management UI**
- **DB schema**: Build complete schema in Phase 1 even for Phase 2/3 features — avoid mid-project migrations
- **Soft-delete**: Items use `is_active` flag from day one

### Claude's Discretion
- Cookie configuration details (SameSite=Lax, Secure, HttpOnly — use better-auth defaults, test on mobile Safari)
- Database schema design for multi-household membership (join table structure)
- Exact email template design for invite emails
- Error state handling for failed signups, invalid tokens, expired links
- Loading and skeleton states

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can sign up with email and password | better-auth `emailAndPassword` plugin; Drizzle `user` + `account` + `session` tables; shadcn/ui form with react-hook-form + Zod |
| AUTH-02 | User can log in with email and password | better-auth `signInEmail` API; client `authClient.signIn.email()`; App Router handler via `toNextJsHandler` |
| AUTH-03 | User session persists across browser refresh | better-auth 30-day sliding session via `expiresIn` + `updateAge`; HttpOnly cookie; middleware `getSessionCookie()` check |
| AUTH-04 | User can log out from any page | `authClient.signOut()` client call; server-side cookie clearing; redirect to `/login` |
| HSHD-01 | User can create a household during onboarding | better-auth organization plugin `create()` API; multi-step signup flow (email/password → household name); active org set in session |
| HSHD-02 | Household admin can invite members by email | better-auth organization `inviteMember()` + `sendInvitationEmail` hook; Resend + React Email; `invitationExpiresIn` for 7-day expiry |
| HSHD-03 | Household admin can generate a shareable join link | Custom `household_join_links` table (token, householdId, expiresAt, createdAt, createdBy); NOT a better-auth built-in — requires custom API route |
| HSHD-04 | User can join a household via invite email or join link | Email path: better-auth `acceptInvitation(invitationId)`; Link path: custom token lookup + `auth.api.addMember()` server-side |
</phase_requirements>

---

## Summary

Phase 1 establishes the authentication and household-membership foundation on which all subsequent phases depend. The tech stack (Next.js App Router + better-auth + Drizzle/Neon + shadcn/ui + Resend) is a well-documented, actively maintained combination in 2025/2026 with official guides for each integration point.

The primary complexity in this phase is the **dual invite mechanism**. better-auth's organization plugin handles email-based invitations natively (including `sendInvitationEmail` callbacks and `acceptInvitation` flows). However, the **shareable join link** (HSHD-03) — multi-use, no email required — is not a built-in feature of better-auth's organization plugin. It must be implemented as a custom `household_join_links` table with a server-side token-validation route. This is the single most significant custom-build item in the phase.

The database schema must be built in full during Phase 1, covering all Phase 2/3 tables (items, categories, stores), to avoid mid-project migrations. better-auth generates its own tables (user, session, account, verification, organization, member, invitation) via `npx auth@latest generate`; the household-specific custom tables (join_links, and the full v1 domain tables) must be written manually as Drizzle schema definitions. Session policy (30-day sliding, HttpOnly, SameSite=Lax) uses better-auth defaults but requires explicit `expiresIn` configuration and a verified real-device test on mobile Safari.

**Primary recommendation:** Use better-auth's organization plugin for email invites and session management. Implement shareable join links as a thin custom endpoint backed by a `household_join_links` table. Build the complete DB schema (all phases) as Drizzle definitions in Phase 1.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.x | App Router framework | Locked decision; official Vercel deployment target |
| better-auth | 1.3.x | Auth sessions, email/password, organization plugin | Locked decision; self-hosted, TypeScript-native, no vendor lock-in |
| drizzle-orm | 0.39.x | Type-safe ORM | Locked decision; works with Neon serverless driver |
| drizzle-kit | 0.30.x | Migration + schema generation CLI | Required companion to drizzle-orm |
| @neondatabase/serverless | 0.10.x | Neon HTTP/WebSocket PostgreSQL driver | Required for Vercel edge-compatible DB access |
| tailwindcss | 3.x / 4.x | Utility CSS | Locked decision |
| shadcn/ui | latest | Component library (copied into project) | Locked decision; shadcn CLI copies source into `components/ui/` |
| resend | 4.x | Transactional email API | Locked decision |
| @react-email/components | 0.0.x | React-based email templates | Locked decision; renders to HTML via Resend `react:` param |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-hook-form | 7.x | Form state management | All auth + household forms (signup, login, invite) |
| @hookform/resolvers | 3.x | Connects RHF to Zod | Used alongside react-hook-form |
| zod | 3.x | Schema validation | Form inputs, API route payloads |
| drizzle-zod | 0.7.x | Generate Zod schemas from Drizzle tables | Avoids duplicating validation logic |
| dotenv | 16.x | Env vars in Node scripts | drizzle-kit config, seed scripts |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-auth organization plugin | Custom household tables only | Plugin provides invitation APIs, role system, and session activeOrgId for free; custom-only approach is more work for same result |
| better-auth organization plugin (email invites) | Community `better-auth-invite-plugin` | Community plugin adds token-based invites; use only if built-in `inviteMember()` proves insufficient |
| Resend | Postmark, SendGrid | Resend has the cleanest React Email integration; all three require same SPF/DKIM DNS setup |

**Installation:**
```bash
npm install better-auth drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
npm install resend @react-email/components
npm install react-hook-form @hookform/resolvers zod drizzle-zod
npx shadcn@latest init
npx shadcn@latest add button input form card dialog dropdown-menu avatar separator toast
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/                  # Route group — no shared layout with main app
│   │   ├── sign-up/page.tsx     # Step 1: email+password
│   │   ├── onboarding/page.tsx  # Step 2: household name (post-signup)
│   │   ├── sign-in/page.tsx
│   │   └── accept-invite/page.tsx  # Handles ?invitationId= param
│   ├── (app)/                   # Route group — requires auth
│   │   ├── layout.tsx           # Auth check + household context
│   │   └── dashboard/page.tsx
│   ├── api/
│   │   ├── auth/[...all]/route.ts   # better-auth handler
│   │   └── households/
│   │       ├── join-links/route.ts  # POST: create join link
│   │       └── join/route.ts        # POST: consume token, add member
│   └── layout.tsx
├── db/
│   ├── index.ts          # Neon + Drizzle client
│   ├── schema/
│   │   ├── auth.ts       # better-auth generated tables (user, session, account, verification, org, member, invitation)
│   │   ├── households.ts # household_join_links table
│   │   ├── items.ts      # Phase 2 tables (items, categories, stores) — built now
│   │   └── index.ts      # Re-exports all schema
│   └── migrations/       # drizzle-kit generated SQL
├── lib/
│   ├── auth.ts           # betterAuth() server instance
│   ├── auth-client.ts    # createAuthClient() browser instance
│   └── email/
│       └── invite-template.tsx   # React Email template
├── middleware.ts          # Route protection via getSessionCookie()
└── drizzle.config.ts
```

### Pattern 1: better-auth Server + Client Split

**What:** better-auth requires two separate instances — one for server (API routes, RSC) and one for the client (React components).

**When to use:** Always. Never import the server `auth` instance in client components.

```typescript
// lib/auth.ts — SERVER ONLY
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  session: {
    expiresIn: 60 * 60 * 24 * 30,    // 30 days
    updateAge: 60 * 60 * 24,          // extend session daily on activity
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [
    organization({
      invitationExpiresIn: 60 * 60 * 24 * 7,  // 7 days (overrides 48h default)
      sendInvitationEmail: async (data) => {
        // Call Resend here — see Email section
      },
    }),
  ],
});
```

```typescript
// lib/auth-client.ts — CLIENT ONLY ("use client" or imported in client components)
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
```

### Pattern 2: Next.js App Router Handler

**What:** Mount better-auth at `/api/auth/[...all]` using the `toNextJsHandler` adapter.

```typescript
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Pattern 3: Middleware Route Protection (Cookie-Only, Fast)

**What:** Check for session cookie existence in middleware — fast, no DB round-trip. Append `returnTo` for post-login redirect.

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = ["/dashboard", "/household"];
const AUTH_ROUTES = ["/sign-in", "/sign-up", "/onboarding"];

export function middleware(request: NextRequest) {
  const session = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!session && isProtected) {
    const loginUrl = new URL("/sign-in", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

**Important:** Middleware is an optimistic guard only. Always validate sessions in Server Components and Server Actions too (CVE-2025-29927 — never rely on middleware as sole auth layer).

### Pattern 4: Session Retrieval in Server Components

```typescript
// app/(app)/layout.tsx — validates session server-side
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <>{children}</>;
}
```

### Pattern 5: Onboarding Multi-Step Flow

**What:** After successful email/password signup, redirect to `/onboarding` where the user names their household. Only after household creation do they see the app.

**Implementation approach:**
1. `sign-up/page.tsx` — calls `authClient.signUp.email()` → on success, `router.push("/onboarding")`
2. `onboarding/page.tsx` — calls `authClient.organization.create({ name })` → sets it as active → `router.push("/dashboard")`
3. Middleware: allow `/onboarding` even if no `activeOrganizationId` in session, but redirect to `/onboarding` if authenticated user has no household

### Pattern 6: Shareable Join Link (Custom)

**What:** better-auth does NOT provide multi-use join links. This is a custom implementation.

**Schema** (add to `db/schema/households.ts`):
```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const householdJoinLinks = pgTable("household_join_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),  // crypto.randomBytes(32).toString("hex")
  organizationId: text("organization_id").notNull(),
  createdById: text("created_by_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

**Flow:**
- `POST /api/households/join-links` — authenticated admin creates a link (7-day expiry, regenerating invalidates old one by deleting and recreating)
- `GET /join?token=xxx` — public page: if logged in, auto-join; if not, redirect to sign-up with `?joinToken=xxx` query param preserved
- After signup, read `joinToken` from URL, call `POST /api/households/join` with it
- Server route: validates token not expired, calls `auth.api.addMember({ userId, organizationId, role: "member" })`, deletes used-once? No — multi-use, so don't delete

### Pattern 7: Email Invite → Signup → Auto-Join Flow

**What:** New user clicks email invite link containing `?invitationId=xxx`.

1. Invitation ID is stored in `localStorage` or passed as URL param through signup
2. After signup completes: call `authClient.organization.acceptInvitation({ invitationId })`
3. better-auth links the new user to the organization

**Context preservation:** Store `invitationId` in `sessionStorage` before redirect to sign-up; read it back on sign-up success.

### Anti-Patterns to Avoid

- **Importing `auth` (server) in client components:** Causes bundle bleed and exposes secrets — always use `authClient` on the client.
- **Relying solely on middleware for auth:** CVE-2025-29927 shows middleware can be bypassed — always check session in RSC/Server Actions too.
- **Hard-deleting users or items:** Decision is soft-delete; `is_active` flag from day one.
- **Fetching session in every RSC individually:** Use layout-level session check to avoid N round-trips.
- **Using `npx drizzle-kit push` in production:** Use `drizzle-kit generate` + `drizzle-kit migrate` for production migrations; `push` is dev-only.
- **Deploying on a public suffix domain (e.g. `*.vercel.app`) without a custom domain:** Safari ITP will block session cookies on shared-suffix domains in some configurations — always use a custom domain in production.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | bcrypt wrapper | better-auth built-in | better-auth handles argon2/bcrypt, salt, timing-safe compare |
| Session token generation | `crypto.randomUUID` + DB | better-auth sessions | Session rotation, expiry, cookie setting all handled |
| Email invitation with accept/reject state machine | Custom invite table + status logic | better-auth organization `inviteMember()` | Plugin manages invitation status, expiry, role assignment |
| CSRF protection | Custom header checks | better-auth built-in | better-auth validates `Origin`/`Referer` headers automatically |
| Multi-org membership | Custom join table queries | better-auth organization member table | Plugin provides `listMembers`, `removeMember`, `updateMemberRole` APIs |
| Active org tracking in session | Custom session field | better-auth session `activeOrganizationId` | Plugin adds this field to the session table automatically |
| Form validation (client + server) | Manual RegEx checks | Zod + drizzle-zod | Type-safe, composable, schema-derived validation |
| React email templates | HTML string templates | `@react-email/components` | Responsive, tested across email clients, type-safe props |

**Key insight:** better-auth's organization plugin covers ~80% of household membership complexity. The only genuine custom build required is the multi-use shareable join link (HSHD-03), because better-auth invitations are email-scoped (one invite = one email address).

---

## Common Pitfalls

### Pitfall 1: better-auth Organization Plugin Schema Not Generated

**What goes wrong:** Developer configures the `organization` plugin but forgets to re-run `npx auth@latest generate` — missing `organization`, `member`, `invitation` tables cause runtime errors.

**Why it happens:** Each plugin added to better-auth requires additional DB tables that only appear in the CLI output when the plugin is included in `auth.ts` at generate time.

**How to avoid:** Run `npx auth@latest generate` after adding any plugin. Commit the generated schema to git before running migrations.

**Warning signs:** `relation does not exist` PostgreSQL errors at runtime; session `activeOrganizationId` field missing.

### Pitfall 2: Safari ITP Blocking Session Cookies

**What goes wrong:** Auth works in Chrome/Firefox but users on Safari (especially iOS) are logged out on every visit.

**Why it happens:** Safari's Intelligent Tracking Prevention blocks third-party cookies. If the app frontend and API are on different domains (or a public-suffix domain like `*.vercel.app`), Safari treats the cookie as cross-site.

**How to avoid:** Use a custom domain with Vercel. Ensure `BETTER_AUTH_URL` matches the production domain exactly. better-auth defaults to `SameSite=Lax` which is correct for same-domain deployments. Test on a real iOS device — DevTools simulation does not replicate ITP behavior.

**Warning signs:** Login works in desktop browsers but fails on iOS; cookie not visible in Safari Web Inspector.

### Pitfall 3: Invite Context Lost Through Signup Redirect

**What goes wrong:** New user clicks invite link, gets redirected to sign-up, completes signup — but the `invitationId` or `joinToken` is lost.

**Why it happens:** Standard redirect discards query params; browser navigation between pages doesn't preserve state automatically.

**How to avoid:** Before redirecting to sign-up, write the token to `sessionStorage`. On sign-up success callback, read from `sessionStorage` and call accept/join. Alternatively, keep the token in the URL through the entire flow (e.g., `/sign-up?invitationId=xxx`).

**Warning signs:** Users complete signup but land in a "create household" flow instead of joining the intended household.

### Pitfall 4: Missing `returnTo` After Session Expiry

**What goes wrong:** User's session expires, they're redirected to `/sign-in`, they log in, but they land on `/dashboard` instead of the page they were trying to reach.

**Why it happens:** Middleware redirects without appending the original URL as a query parameter.

**How to avoid:** In middleware, set `loginUrl.searchParams.set("returnTo", pathname)`. On sign-in success, read `returnTo` from `searchParams` and `router.push(returnTo)`.

**Warning signs:** Users report being dropped to home page after re-login.

### Pitfall 5: 48-Hour Default Invitation Expiry (Not 7-Day)

**What goes wrong:** Invitations expire in 48 hours instead of the required 7 days.

**Why it happens:** better-auth organization plugin defaults `invitationExpiresIn` to 172800 seconds (48h). The decision requires 7 days (604800 seconds).

**How to avoid:** Explicitly set `invitationExpiresIn: 60 * 60 * 24 * 7` in the organization plugin config. Verify by inspecting the `expiresAt` column on created invitations.

**Warning signs:** Invited users report "invitation expired" errors within 2 days.

### Pitfall 6: Join Link Multi-Use With Expiry — No Delete on Accept

**What goes wrong:** Join link token is deleted after first use (treating it as single-use), breaking the multi-use requirement.

**Why it happens:** Conflation with single-use token patterns (password reset, email verification).

**How to avoid:** The join link token should only be deleted when the admin regenerates the link. On each join event: validate `expiresAt > now()`, add member — do NOT delete the token. Track member joins separately if needed.

### Pitfall 7: Admin-Leaves Promotion Race Condition

**What goes wrong:** Two admins leave simultaneously; neither gets promoted; household has no admin.

**Why it happens:** Naive "if role=admin, promote next member" logic without a DB transaction.

**How to avoid:** Wrap the "leave + promote" operation in a single Drizzle transaction. Query for `ORDER BY created_at ASC LIMIT 1` to find the longest-standing member, update role, then remove the leaving admin — all in one transaction.

### Pitfall 8: Neon Serverless + Vercel Connection Pooling

**What goes wrong:** Database connection limits exceeded under load; `max_connections` errors.

**Why it happens:** Serverless functions create a new DB connection per invocation. Without pooling, 100 concurrent requests = 100 connections.

**How to avoid:** Use Neon's built-in connection pooler (pgBouncer endpoint) for HTTP-mode queries. The `@neondatabase/serverless` driver uses HTTP by default for single queries, which is inherently connection-pool-friendly. For transactions, use the WebSocket-based `neon()` driver.

---

## Code Examples

### Drizzle + Neon Client Setup

```typescript
// db/index.ts
// Source: https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### better-auth Drizzle Adapter Configuration

```typescript
// lib/auth.ts
// Source: https://better-auth.com/docs/adapters/drizzle
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    // better-auth defaults: SameSite=Lax, Secure (prod), HttpOnly
    // Only override if same-domain deployment has issues
  },
  plugins: [
    organization({
      invitationExpiresIn: 60 * 60 * 24 * 7,
      async sendInvitationEmail(data) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "Household App <noreply@yourdomain.com>",
          to: data.email,
          subject: `You're invited to join ${data.organization.name}`,
          react: InviteEmailTemplate({
            inviterName: data.inviter.user.name,
            householdName: data.organization.name,
            inviteUrl: data.url,
          }),
        });
      },
    }),
  ],
});
```

### Client-Side Sign-Up with Organization Creation

```typescript
// Conceptual flow — not a single file
// Source: https://better-auth.com/docs/integrations/next

// Step 1: Sign up
await authClient.signUp.email({
  email,
  password,
  name,
  callbackURL: "/onboarding",  // redirect after email verification (if enabled)
});

// Step 2: Create household (on /onboarding page)
const org = await authClient.organization.create({
  name: householdName,
  slug: generateSlug(householdName),
});

// Step 3: Set as active
await authClient.organization.setActive({ organizationId: org.data?.id });
```

### Drizzle Config

```typescript
// drizzle.config.ts
// Source: https://orm.drizzle.team/docs/tutorials/drizzle-with-neon
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

### Shareable Join Link — Token Generation

```typescript
// app/api/households/join-links/route.ts
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { householdJoinLinks } from "@/db/schema/households";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { organizationId } = await req.json();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Delete existing link for this org (regenerate = replace)
  await db.delete(householdJoinLinks).where(
    eq(householdJoinLinks.organizationId, organizationId)
  );

  await db.insert(householdJoinLinks).values({
    token,
    organizationId,
    createdById: session.user.id,
    expiresAt,
  });

  const url = `${process.env.BETTER_AUTH_URL}/join?token=${token}`;
  return Response.json({ url });
}
```

---

## Full Database Schema Plan

Build the complete schema in Phase 1 to avoid mid-project migrations. Group into files:

**`db/schema/auth.ts`** — Generated by `npx auth@latest generate`:
- `user` — id, name, email, emailVerified, image, createdAt, updatedAt
- `session` — id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt, **activeOrganizationId** (org plugin)
- `account` — id, userId, accountId, providerId, accessToken, refreshToken, password, createdAt, updatedAt
- `verification` — id, identifier, value, expiresAt, createdAt, updatedAt
- `organization` — id, name, slug, logo, metadata, createdAt
- `member` — id, userId, organizationId, role, createdAt
- `invitation` — id, email, inviterId, organizationId, role, status, expiresAt, createdAt

**`db/schema/households.ts`** — Custom:
- `household_join_links` — id (uuid), token (text unique), organizationId (text), createdById (text), expiresAt (timestamp), createdAt (timestamp)

**`db/schema/items.ts`** — Phase 2/3 tables (built now, used later):
- `categories` — id, organizationId, name, isDefault (bool), isActive (bool), createdAt
- `stores` — id, organizationId, name, isActive (bool), createdAt, updatedAt
- `items` — id, organizationId, name, quantity, note, categoryId, isActive (bool), createdAt, updatedAt, createdById

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NextAuth.js (Auth.js) | better-auth | 2024–2025 | better-auth is self-hosted, TypeScript-native, has organization plugin built-in; Auth.js lacks multi-tenancy primitives |
| Prisma ORM | Drizzle ORM | 2023–2024 | Drizzle is SQL-first, no "magic" query translation, significantly better performance on serverless with Neon |
| Next.js `middleware.ts` as sole auth guard | Defense-in-depth (middleware + RSC + Server Actions) | 2025 (CVE-2025-29927) | Middleware bypass vulnerability; middleware is now considered optimistic guard only |
| Pages Router API routes | App Router Server Actions + Route Handlers | 2023–present | App Router is the stable default; Pages Router still supported but not recommended for new projects |
| Hardcoded email HTML strings | React Email components | 2023–present | Consistent rendering across clients; type-safe props; testable |

**Deprecated/outdated:**
- `next-auth` v4 patterns: Do not use; v5 (Auth.js) has different API and the project has chosen better-auth
- `drizzle-kit push` in production: Only for dev/prototyping; use `generate` + `migrate` for all production changes
- Single-domain session checking in middleware: No longer sufficient; always add server-side checks

---

## Open Questions

1. **Does better-auth organization plugin's `inviteMember()` accept custom expiry per invitation (not just global config)?**
   - What we know: `invitationExpiresIn` is a global plugin config value (48h default → override to 7 days)
   - What's unclear: Whether per-invitation custom expiry is supported (e.g., short-lived vs. long-lived invites in different contexts)
   - Recommendation: Use global 7-day config for now; if per-invite expiry is needed, use `beforeCreateInvitation` hook to override `expiresAt`

2. **`activeOrganizationId` in session for household switcher — is it automatically updated on `setActive()`, or does the session need refresh?**
   - What we know: `authClient.organization.setActive()` updates the session's `activeOrganizationId` server-side
   - What's unclear: Whether the client session cache refreshes immediately or needs a `router.refresh()` call
   - Recommendation: Call `router.refresh()` after `setActive()` per the Next.js App Router caching note in better-auth docs

3. **Phase 2/3 table schema: should categories and default seeding happen in Phase 1 DB setup or Phase 2?**
   - What we know: Decision is to build the full schema in Phase 1
   - What's unclear: Whether seed data (default grocery categories) should be inserted in Phase 1 or deferred to Phase 2 execution
   - Recommendation: Create the table schema in Phase 1; seed default categories in Phase 2 (at feature delivery time, not before)

---

## Validation Architecture

> nyquist_validation is enabled in config.json.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x + React Testing Library 16.x (unit/integration); Playwright (E2E) |
| Config file | `vitest.config.ts` — does not exist yet (Wave 0 gap) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run && npx playwright test` |

**Note:** Async Server Components cannot be unit-tested with Vitest (React ecosystem limitation as of 2026). Use Playwright E2E for Server Component behavior and auth flows.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Sign up with email/password creates user and session | E2E | `npx playwright test e2e/auth/signup.spec.ts` | Wave 0 |
| AUTH-01 | Sign-up form validation (empty fields, invalid email, weak password) | Unit (RTL) | `npx vitest run src/app/(auth)/sign-up` | Wave 0 |
| AUTH-02 | Login with correct credentials redirects to dashboard | E2E | `npx playwright test e2e/auth/login.spec.ts` | Wave 0 |
| AUTH-02 | Login with wrong password shows error | E2E | `npx playwright test e2e/auth/login.spec.ts` | Wave 0 |
| AUTH-03 | Session persists after browser refresh (cookie present) | E2E | `npx playwright test e2e/auth/session-persistence.spec.ts` | Wave 0 |
| AUTH-04 | Logout clears session and redirects to /sign-in | E2E | `npx playwright test e2e/auth/logout.spec.ts` | Wave 0 |
| AUTH-04 | Logout from protected route redirects away from content | E2E | `npx playwright test e2e/auth/logout.spec.ts` | Wave 0 |
| HSHD-01 | Signup followed by onboarding creates household | E2E | `npx playwright test e2e/household/onboarding.spec.ts` | Wave 0 |
| HSHD-01 | Onboarding cannot be skipped (middleware check) | E2E | `npx playwright test e2e/household/onboarding.spec.ts` | Wave 0 |
| HSHD-02 | Admin sends email invite; invitation record created in DB | Integration | `npx vitest run src/app/api/households` | Wave 0 |
| HSHD-02 | Invited email receives email (Resend integration) | Manual only | — | Manual verification |
| HSHD-03 | Admin generates shareable join link | Integration | `npx vitest run src/app/api/households/join-links` | Wave 0 |
| HSHD-03 | Join link respects 7-day expiry (expired token rejected) | Integration | `npx vitest run src/app/api/households/join` | Wave 0 |
| HSHD-03 | Regenerating link invalidates previous link | Integration | `npx vitest run src/app/api/households/join-links` | Wave 0 |
| HSHD-04 | Logged-in user clicking invite link auto-joins household | E2E | `npx playwright test e2e/household/invite-join.spec.ts` | Wave 0 |
| HSHD-04 | New user clicking invite link: signup → auto-join | E2E | `npx playwright test e2e/household/invite-join.spec.ts` | Wave 0 |
| HSHD-04 | New user clicking join link: signup → auto-join | E2E | `npx playwright test e2e/household/join-link.spec.ts` | Wave 0 |

### Key Test Scenarios per Success Criterion

**SC1 — Sign up + persist across refresh:**
```
1. Navigate to /sign-up → fill email, password → submit
2. Complete onboarding (household name)
3. Verify redirect to /dashboard
4. Reload page → verify still on /dashboard (not redirected to /sign-in)
5. Open new tab to /dashboard → verify authenticated
```

**SC2 — Logout from any page:**
```
1. Authenticate via storageState
2. Navigate to /dashboard → click logout
3. Verify redirect to /sign-in
4. Navigate to /dashboard directly → verify redirect to /sign-in
```

**SC3 — Household creation during onboarding:**
```
1. Complete signup with new email
2. Verify redirect to /onboarding (not /dashboard)
3. Enter household name → submit
4. Verify redirect to /dashboard
5. Verify household switcher shows the created household name
```

**SC4 — Email invite → member joins:**
```
1. Admin logs in → navigates to household settings → enters email → sends invite
2. Verify invitation record in DB (integration test)
3. New user arrives at /accept-invite?invitationId=xxx
4. Sign up with same email → verify auto-join (no extra accept step)
5. Verify member appears in household member list
```

**SC5 — Shareable join link:**
```
1. Admin generates join link → copy URL
2. New user navigates to /join?token=xxx → redirected to /sign-up?joinToken=xxx
3. Completes signup → verify auto-join to household
4. Same link works for a second new user (multi-use)
5. Set expiresAt to past in DB → verify expired link shows error page
```

### Authentication Pattern for E2E Tests

Use Playwright `storageState` to avoid running login UI in every test:

```typescript
// e2e/auth.setup.ts
import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(process.env.TEST_EMAIL!);
  await page.getByLabel("Password").fill(process.env.TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign up" }).click();
  // Complete onboarding
  await page.getByLabel("Household name").fill("Test Household");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
```

Add `.gitignore` entry: `playwright/.auth/`

### Sampling Rate

- **Per task commit:** `npx vitest run` (unit + integration, <30s)
- **Per wave merge:** `npx vitest run && npx playwright test --project=chromium`
- **Phase gate:** Full suite green (`npx playwright test` all browsers) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — Vitest configuration with jsdom, path aliases, setup file
- [ ] `src/test/setup.ts` — RTL cleanup, jest-dom matchers
- [ ] `playwright.config.ts` — webServer, projects (setup + chromium + firefox + webkit), storageState
- [ ] `e2e/auth.setup.ts` — Playwright auth setup that creates test user + household
- [ ] `e2e/auth/signup.spec.ts` — AUTH-01 scenarios
- [ ] `e2e/auth/login.spec.ts` — AUTH-02 scenarios
- [ ] `e2e/auth/session-persistence.spec.ts` — AUTH-03 scenarios
- [ ] `e2e/auth/logout.spec.ts` — AUTH-04 scenarios
- [ ] `e2e/household/onboarding.spec.ts` — HSHD-01 scenarios
- [ ] `e2e/household/invite-join.spec.ts` — HSHD-02 + HSHD-04 email invite path
- [ ] `e2e/household/join-link.spec.ts` — HSHD-03 + HSHD-04 join link path
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event vite-tsconfig-paths`
- [ ] Framework install: `npm install -D @playwright/test && npx playwright install`
- [ ] Environment: `.env.test` with `TEST_EMAIL`, `TEST_PASSWORD`, `DATABASE_URL` (test DB or Neon branch)

---

## Sources

### Primary (HIGH confidence)
- [better-auth.com/docs/installation](https://better-auth.com/docs/installation) — Core setup, env vars, DB tables
- [better-auth.com/docs/integrations/next](https://better-auth.com/docs/integrations/next) — `toNextJsHandler`, session retrieval, middleware pattern
- [better-auth.com/docs/plugins/organization](https://better-auth.com/docs/plugins/organization) — Organization plugin schema, invitation APIs, `invitationExpiresIn`, client methods
- [better-auth.com/docs/adapters/drizzle](https://better-auth.com/docs/adapters/drizzle) — `drizzleAdapter` configuration, `npx auth@latest generate`
- [orm.drizzle.team/docs/tutorials/drizzle-with-neon](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) — Neon serverless driver + Drizzle setup
- [nextjs.org/docs/app/guides/testing/vitest](https://nextjs.org/docs/app/guides/testing/vitest) — Official Vitest + Next.js App Router setup
- [nextjs.org/docs/app/guides/testing/playwright](https://nextjs.org/docs/app/guides/testing/playwright) — Official Playwright + Next.js setup
- [playwright.dev/docs/auth](https://playwright.dev/docs/auth) — `storageState` authentication pattern
- [resend.com/docs/send-with-nextjs](https://resend.com/docs/send-with-nextjs) — Resend + Next.js App Router integration

### Secondary (MEDIUM confidence)
- [better-auth GitHub Discussion #2826](https://github.com/better-auth/better-auth/discussions/2826) — Safari ITP cookie issue, resolution via custom domain
- [better-auth GitHub Issue #3672](https://github.com/better-auth/better-auth/issues/3672) — Confirms no built-in shareable join link; email-scoped only
- [projectdiscovery.io/blog/nextjs-middleware-authorization-bypass](https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass) — CVE-2025-29927 middleware bypass, defense-in-depth requirement
- [better-auth.com/blog/1-3](https://better-auth.com/blog/1-3) — v1.3 custom fields on invitation/organization/member tables

### Tertiary (LOW confidence — verify before relying on)
- Vitest version `^4.0.18` cited in search results — verify against current npm registry before pinning
- better-auth `experimental.joins: true` for 2-3x performance — verify this is stable in current version before enabling in production

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against official docs for all core libraries
- Architecture: HIGH — patterns from official better-auth + Next.js docs; organization plugin API verified
- Shareable join link (HSHD-03): MEDIUM — confirmed as not built into better-auth; custom approach is standard web pattern but no official reference implementation
- Pitfalls: HIGH — Safari ITP issue verified against GitHub issues; CVE-2025-29927 from official security advisory; others from official docs
- Validation architecture: HIGH — official Playwright/Vitest docs confirmed

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable libraries; better-auth is actively developed — check changelog before executing)
