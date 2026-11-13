import { getRequestSession } from "@/lib/request-auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: validate session server-side, not just middleware
  // See CVE-2025-29927 — middleware alone is not a sufficient auth guard
  const session = await getRequestSession();
  if (!session) {
    redirect("/sign-in");
  }

  if (!session.activeHouseholdId) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
