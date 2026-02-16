"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { FileText, Coins, PanelLeftClose, PanelLeft, Cpu, Users, User, Plug } from "lucide-react";
import { SidebarItem } from "./SidebarItem";
import { useSidebarState } from "@/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface SidebarProps {
  className?: string;
}

function SidebarContent({ className = "" }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isExpanded, toggle, isHydrated } = useSidebarState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [orgRef, setOrgRef] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const currentTab = searchParams.get("tab");

  // Extract org ref from URL if present
  useEffect(() => {
    const match = pathname.match(/\/dashboard\/org\/([^/]+)/);
    if (match) {
      setOrgRef(match[1]);
    } else {
      // Load org ref from user's default org
      const loadOrgRef = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: userData } = await supabase
            .from("users")
            .select("org_id")
            .eq("id", user.id)
            .single();

          if (userData?.org_id) {
            const { data: orgData } = await supabase
              .from("organizations")
              .select("ref")
              .eq("id", userData.org_id)
              .single();

            // Use ref if available, otherwise use org_id
            setOrgRef(orgData?.ref || userData.org_id);
          }
        }
      };
      loadOrgRef();
    }
  }, [pathname, supabase]);

  const dashboardHref = orgRef ? `/dashboard/org/${orgRef}` : "/dashboard";

  const navItems = [
    {
      icon: <FileText className="w-5 h-5" />,
      label: "Documents",
      href: dashboardHref,
      isActive: pathname.startsWith("/dashboard"),
    },
    {
      icon: <Coins className="w-5 h-5" />,
      label: "Tokens",
      href: "/savings",
      isActive: pathname === "/savings",
    },
    {
      icon: <Cpu className="w-5 h-5" />,
      label: "Model",
      href: "/settings/model",
      isActive: pathname === "/settings/model",
    },
    {
      icon: <Users className="w-5 h-5" />,
      label: "Team",
      href: "/settings/team",
      isActive: pathname === "/settings/team",
    },
    // TODO: Re-enable billing when ready
    // {
    //   icon: <CreditCard className="w-5 h-5" />,
    //   label: "Billing",
    //   href: "/settings/billing",
    //   isActive: pathname === "/settings/billing",
    // },
    {
      icon: <Plug className="w-5 h-5" />,
      label: "Connectors",
      href: "/settings/connectors",
      isActive: pathname === "/settings/connectors",
    },
    {
      icon: <User className="w-5 h-5" />,
      label: "Account",
      href: "/settings/account",
      isActive: pathname === "/settings/account",
    },
  ];

  const sidebarWidth = isHydrated ? (isExpanded ? 220 : 56) : 220;

  return (
    <aside
      style={{
        width: sidebarWidth,
        transition: "width 0.2s ease"
      }}
      className={cn(
        "h-screen bg-muted flex flex-col fixed left-0 top-0 z-40 border-r border-border",
        className
      )}
    >
      {/* Logo Section with Toggle */}
      <div
        className={cn("flex items-center justify-between", isExpanded ? 'p-3' : 'px-2 py-2')}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isExpanded ? (
          <>
            <div className="flex items-center gap-2 pl-1">
              <Image src="/brief.png" alt="Brief" width={72} height={24} className="h-6 w-auto" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              className={cn(
                "h-8 w-8 transition-opacity",
                isHovered ? "opacity-100" : "opacity-0"
              )}
            >
              <PanelLeftClose className="w-5 h-5 text-muted-foreground" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-10 w-10 mx-auto"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {isHovered ? (
                <PanelLeft className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Image src="/brief-icon.png" alt="Brief" width={24} height={24} className="h-6 w-auto object-contain" />
              )}
            </div>
          </Button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-2 py-2 space-y-1">
        {navItems.map((item) => (
          <SidebarItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            href={item.href}
            isExpanded={isExpanded}
            isActive={item.isActive}
          />
        ))}
      </nav>
    </aside>
  );
}

export function Sidebar({ className = "" }: SidebarProps) {
  return (
    <Suspense fallback={<aside className="h-screen bg-muted fixed left-0 top-0 z-40 border-r border-border w-[220px]" />}>
      <SidebarContent className={className} />
    </Suspense>
  );
}
