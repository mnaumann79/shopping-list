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

function truncate(str: string, max = 20) {
  return str.length > max ? str.slice(0, max) + "…" : str;
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
  const { data: session } = authClient.useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);

  useEffect(() => {
    authClient.organization.list().then((result) => {
      if (result.data) {
        setOrgs(result.data as Org[]);
      }
    });
  }, []);

  const activeOrgId = session?.session?.activeOrganizationId ?? null;
  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const otherOrgs = orgs.filter((o) => o.id !== activeOrgId);

  async function handleSwitch(orgId: string) {
    await authClient.organization.setActive({ organizationId: orgId });
    router.refresh();
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
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-xs">
            {getInitials(activeOrg.name)}
          </AvatarFallback>
        </Avatar>
        <span>{truncate(activeOrg.name)}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
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
          <span className="font-medium">{truncate(activeOrg.name)}</span>
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
                {truncate(org.name)}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
