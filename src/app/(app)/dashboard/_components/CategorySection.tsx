"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface CategorySectionProps {
  title?: string;
  category?: { id: string; name: string };
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
  onToggle?: () => void;
  itemCount: number;
  children: ReactNode;
}

export function CategorySection({
  title,
  category,
  defaultCollapsed = false,
  isCollapsed,
  onToggle,
  itemCount,
  children,
}: CategorySectionProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const collapsed = isCollapsed ?? internalCollapsed;
  const sectionTitle = title ?? category?.name ?? "Section";

  function handleToggle() {
    if (onToggle) {
      onToggle();
      return;
    }

    setInternalCollapsed((current) => !current);
  }

  return (
    <section className="space-y-2">
      <button
        type="button"
        className="flex w-full items-center justify-between px-1 py-2 text-left"
        onClick={handleToggle}
      >
        <span className="font-medium">
          {sectionTitle} ({itemCount})
        </span>
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {!collapsed && <div className="divide-y">{children}</div>}
      <Separator />
    </section>
  );
}
