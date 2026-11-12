"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

interface Org {
  id: string;
  name: string;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function HouseholdSwitcher() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authClient.organization.list().then((result) => {
      if (result.data) {
        setOrgs(result.data as Org[]);
      }
      setLoaded(true);
    });
  }, []);

  const activeOrgId = session?.session?.activeOrganizationId ?? null;
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const otherOrgs = orgs.filter((o) => o.id !== activeOrgId);

  async function handleSwitch(orgId: string) {
    await authClient.organization.setActive({ organizationId: orgId });
    router.refresh();
  }

  // The household list arrives after the first render, so show nothing until
  // it does - "No household" would be wrong in the meantime.
  if (!loaded || isPending) {
    return null;
  }

  if (!activeOrg) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        No household
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarFallback className="text-xs">
            {getInitials(activeOrg.name)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">{activeOrg.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Current household
        </DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <Avatar className="h-5 w-5 mr-2">
            <AvatarFallback className="text-xs">
              {getInitials(activeOrg.name)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{activeOrg.name}</span>
        </DropdownMenuItem>
        {otherOrgs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Switch to
            </DropdownMenuLabel>
            {otherOrgs.map((org) => (
              <DropdownMenuItem key={org.id} onClick={() => handleSwitch(org.id)}>
                <Avatar className="h-5 w-5 mr-2">
                  <AvatarFallback className="text-xs">
                    {getInitials(org.name)}
                  </AvatarFallback>
                </Avatar>
                {org.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
