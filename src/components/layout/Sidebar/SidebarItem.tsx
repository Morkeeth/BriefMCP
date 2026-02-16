"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  isExpanded: boolean;
  isActive?: boolean;
  size?: "default" | "sm";
}

export function SidebarItem({
  icon,
  label,
  href,
  onClick,
  isExpanded,
  isActive = false,
  size = "default",
}: SidebarItemProps) {
  const baseClasses = cn(
    "flex items-center transition-colors rounded-md",
    isExpanded
      ? size === "sm"
        ? "gap-2 px-2 py-1.5"
        : "gap-3 px-3 py-2"
      : "justify-center p-2",
    isActive
      ? "bg-background text-foreground"
      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
  );

  const content = (
    <>
      <span className="flex-shrink-0">{icon}</span>
      {isExpanded && (
        <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
          {label}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={baseClasses}
        title={!isExpanded ? label : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn("w-full", baseClasses)}
      title={!isExpanded ? label : undefined}
    >
      {content}
    </button>
  );
}
