# Phase 1: Foundation - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Authenticated users and household setup with member invites. This phase establishes the security boundary and household context that all other phases build on. Covers: user accounts (signup, login, logout, session), household creation, member invites (email + link), member removal, and the household switcher for multi-household support.

Shopping list features (items, categories, stores) are out of scope — those are Phase 2 and 3.

</domain>

<decisions>
## Implementation Decisions

### Tech Stack
- **Framework**: Next.js (App Router)
- **Auth library**: better-auth — email/password + sessions, self-hosted, no vendor lock-in
- **Database**: PostgreSQL (Neon) + Drizzle ORM
- **Deployment**: Vercel (app) + Neon Postgres (database)
- **Styling**: Tailwind CSS + shadcn/ui — use shadcn components for forms, dialogs, buttons
- **Email**: Resend + React Email for transactional emails (invite emails)

### Onboarding Flow
- Signup forces household creation — every user must belong to a household before seeing the app
- Household creation step: name only (one field, e.g. "The Smiths") — no wizard, keep it fast
- If user arrives via invite link: signup → auto-join household (no separate "accept" step)
- Users can belong to multiple households — household switcher is required from day one

### Household Switcher
- Lives in the header/nav — dropdown showing current household name
- Familiar pattern (like GitHub org switcher)

### Invite Mechanism
- Both email invite (HSHD-02) and shareable join link (HSHD-03) supported
- Join links expire after 7 days; admin can regenerate
- Join links are multi-use — anyone with the link can join (useful for group chat sharing)
- Existing logged-in user clicking an invite link: auto-join household immediately (no extra confirmation)
- New user clicking an invite link: signup → auto-join (invite context preserved through signup flow)

### Membership Management
- Admin can remove members; any member can leave on their own
- When a member leaves or is removed: their items stay on the household list (items belong to the household, not the user — consistent with soft-delete strategy)
- If the admin leaves: auto-promote the longest-standing remaining member to admin (no household left without an admin)

### Session Policy
- 30-day sliding sessions — extends on each request, active users never get logged out
- No "remember me" checkbox — always persistent (app is personal device, not shared)
- On session expiry: redirect to login, then return user to the URL they were trying to reach
- No v1 session management UI (no "view/revoke active sessions" — v2 concern)

### Claude's Discretion
- Cookie configuration details (SameSite=Lax, Secure, HttpOnly — use better-auth defaults, test on mobile Safari)
- Database schema design for multi-household membership (join table structure)
- Exact email template design for invite emails
- Error state handling for failed signups, invalid tokens, expired links
- Loading and skeleton states

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes the patterns all subsequent phases will follow
- Pattern decisions for this phase: Next.js App Router conventions, Drizzle schema-first, shadcn/ui components

### Integration Points
- This phase creates the auth session that all subsequent API routes will validate
- Household context established here is the container for Phase 2 (items, categories, stores)
- DB schema built in Phase 1 should include tables for all Phase 2/3 features (per research decision: avoid mid-project migrations)

</code_context>

<specifics>
## Specific Ideas

- Household switcher should feel like GitHub's org switcher — dropdown in the header, current household name displayed
- Signup-to-household flow should be fast: minimal steps, no wizard, get users to the list quickly
- Email invites use Resend + React Email — keep the email template clean and minimal
- Mobile Safari session concern noted in STATE.md: test real device cookie behavior, not just DevTools simulation

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-11*
