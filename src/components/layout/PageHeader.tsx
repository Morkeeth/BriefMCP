"use client";

import { usePathname } from "next/navigation";

interface PageConfig {
  title: string;
  description: string;
}

const PAGE_CONFIGS: Record<string, PageConfig> = {
  "/dashboard": {
    title: "Knowledge Base",
    description: "Manage and organize your documents",
  },
  "/savings": {
    title: "Token Savings",
    description: "Track how Brief optimizes your AI agent usage",
  },
  "/settings/model": {
    title: "AI Model",
    description: "Choose the language model for queries",
  },
  "/settings/team": {
    title: "Team",
    description: "Members of your organization",
  },
  "/settings/organizations": {
    title: "Organizations",
    description: "Manage your organization memberships",
  },
  "/settings/billing": {
    title: "Billing",
    description: "Manage your subscription and payments",
  },
  "/settings/account": {
    title: "Account",
    description: "Manage your account settings",
  },
  "/settings/connectors": {
    title: "Connectors",
    description: "Connect external services to sync your documents",
  },
};

function getPageConfig(pathname: string): PageConfig | null {
  // Direct match
  if (PAGE_CONFIGS[pathname]) {
    return PAGE_CONFIGS[pathname];
  }

  // Check for dashboard/org/[ref] pattern
  if (pathname.startsWith("/dashboard")) {
    return PAGE_CONFIGS["/dashboard"];
  }

  return null;
}

export function PageHeader() {
  const pathname = usePathname();
  const config = getPageConfig(pathname);

  if (!config) return null;

  return (
    <div className="mb-6 mt-2">
      <h1 className="text-2xl font-semibold text-foreground">
        {config.title}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {config.description}
      </p>
    </div>
  );
}
