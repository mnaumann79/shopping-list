"use client";

export type OrganizationMode = "category" | "alphabetical" | "store";

interface OrganizeTripBarProps {
  organizationMode: OrganizationMode;
  setOrganizationMode: (mode: OrganizationMode) => void;
}

/**
 * Fixed bottom bar with trip-organization mode toggle (Category / Store / Alphabetical).
 * Extracted from ShoppingList so it can be loaded via `next/dynamic({ ssr: false })`,
 * removing the "ORGANIZE TRIP" label from initial HTML and shifting the dashboard
 * LCP element to a smaller, faster-painting element.
 */
export function OrganizeTripBar({
  organizationMode,
  setOrganizationMode,
}: OrganizeTripBarProps) {
  return (
    <div className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed right-0 bottom-0 left-0 z-10 border-t px-4 py-3 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">Organize trip</p>
            <div className="bg-muted/40 relative flex justify-between w-full items-center rounded-full border p-1">
              <button
                type="button"
                aria-pressed={organizationMode === "category"}
                className={`rounded-full px-3 py-1.5 text-sm transition ${organizationMode === "category" ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setOrganizationMode("category")}
              >
                Category
              </button>

              <button
                type="button"
                aria-pressed={organizationMode === "store"}
                className={`absolute left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-sm transition ${organizationMode === "store" ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setOrganizationMode("store")}
              >
                Store
              </button>

              <button
                type="button"
                aria-pressed={organizationMode === "alphabetical"}
                className={`rounded-full px-3 py-1.5 text-sm transition ${organizationMode === "alphabetical" ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setOrganizationMode("alphabetical")}
              >
                Alphabetical
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}