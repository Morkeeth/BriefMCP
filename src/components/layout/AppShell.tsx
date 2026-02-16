"use client";

import { Sidebar } from "./Sidebar";
import { AppHeader } from "./AppHeader";
import { PageHeader } from "./PageHeader";
import { useSidebarState } from "@/hooks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isExpanded, isHydrated } = useSidebarState(true);
  const sidebarWidth = isHydrated ? (isExpanded ? 220 : 56) : 220;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <AppHeader />
      <div
        style={{
          paddingLeft: sidebarWidth,
          transition: "padding-left 0.2s ease"
        }}
      >
        <main className="pt-16 pb-8 px-6">
          <PageHeader />
          {children}
        </main>
      </div>
    </div>
  );
}
