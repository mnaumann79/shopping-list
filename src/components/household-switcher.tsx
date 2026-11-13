"use client";

import { useRouter } from "next/navigation";
import { setActiveHousehold } from "@/lib/auth-client";
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

interface Household {
  id: string;
  name: string;
  role: string;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function HouseholdSwitcher({ activeHouseholdId }: { activeHouseholdId: string | null }) {
  const router = useRouter();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/households")
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Household[]) => setHouseholds(data))
      .catch(() => setHouseholds([]))
      .finally(() => setLoaded(true));
  }, []);

  const activeHousehold = households.find((household) => household.id === activeHouseholdId);
  const otherHouseholds = households.filter((household) => household.id !== activeHouseholdId);

  async function handleSwitch(householdId: string) {
    const switched = await setActiveHousehold(householdId);
    if (switched) router.refresh();
  }

  // The household list arrives after the first render, so show nothing until
  // it does - "No household" would be wrong in the meantime.
  if (!loaded) {
    return null;
  }

  if (!activeHousehold) {
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
            {getInitials(activeHousehold.name)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">{activeHousehold.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Current household
        </DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <Avatar className="h-5 w-5 mr-2">
            <AvatarFallback className="text-xs">
              {getInitials(activeHousehold.name)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{activeHousehold.name}</span>
        </DropdownMenuItem>
        {otherHouseholds.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Switch to
            </DropdownMenuLabel>
            {otherHouseholds.map((household) => (
              <DropdownMenuItem key={household.id} onClick={() => handleSwitch(household.id)}>
                <Avatar className="h-5 w-5 mr-2">
                  <AvatarFallback className="text-xs">
                    {getInitials(household.name)}
                  </AvatarFallback>
                </Avatar>
                {household.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
