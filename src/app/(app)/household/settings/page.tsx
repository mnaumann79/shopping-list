import { getRequestSession } from "@/lib/request-auth";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import HouseholdSettingsClient from "./_components/HouseholdSettingsClient";

export default async function HouseholdSettingsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader variant="settings" userName={session.user.name} />
      <HouseholdSettingsClient activeHouseholdId={session.activeHouseholdId} />
    </div>
  );
}
