import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { getAcceptInviteUrl, getAuthBaseUrl, getAuthTrustedOrigins } from "@/lib/app-routes";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  baseURL: getAuthBaseUrl(),
  trustedOrigins: getAuthTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,       // 30 days
    updateAge: 60 * 60 * 24,             // extend daily on activity
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [
    organization({
      invitationExpiresIn: 60 * 60 * 24 * 7,  // 7 days — overrides 48h default
      async sendInvitationEmail(data) {
        const { Resend } = await import("resend");
        const { InviteEmailTemplate } = await import("@/lib/email/invite-template") as { InviteEmailTemplate: (props: { inviterName: string; householdName: string; inviteUrl: string }) => React.ReactElement };
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
        const resend = new Resend(apiKey);
        const inviteUrl = getAcceptInviteUrl(data.id, data.email);
        const { error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@example.com",
          to: data.email,
          subject: `You're invited to join ${data.organization.name}`,
          react: InviteEmailTemplate({
            inviterName: data.inviter.user.name,
            householdName: data.organization.name,
            inviteUrl,
          }),
        });
        if (error) throw new Error(`Resend error: ${error.message}`);
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
