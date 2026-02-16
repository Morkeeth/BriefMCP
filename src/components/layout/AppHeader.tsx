"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Key, ChevronRight, Copy, Check, ArrowLeft } from "lucide-react";
import { useSidebarState } from "@/hooks";
import { AGENTS, getAgentById } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function AppHeader() {
  const [orgName, setOrgName] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  const [isEditingOrgName, setIsEditingOrgName] = useState(false);
  const [editingOrgName, setEditingOrgName] = useState("");
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const { isExpanded, isHydrated } = useSidebarState(true);
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const showOrgBreadcrumb = pathname !== "/organizations";

  useEffect(() => {
    let isMounted = true;

    const loadHeaderData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      const { data: userData } = await supabase
        .from("users")
        .select("org_id, mcp_token")
        .eq("id", user.id)
        .single();

      if (!isMounted) return;

      if (userData?.mcp_token) {
        setMcpToken(userData.mcp_token);
      }

      if (userData?.org_id) {
        setUserOrgId(userData.org_id);

        const { data: orgData } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", userData.org_id)
          .single();

        if (!isMounted) return;

        if (orgData) {
          setOrgName(orgData.name);
        }
      }
    };

    loadHeaderData();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const startEditingOrgName = () => {
    setEditingOrgName(orgName);
    setIsEditingOrgName(true);
  };

  const saveOrgName = async () => {
    if (!userOrgId || !editingOrgName.trim()) {
      setIsEditingOrgName(false);
      return;
    }

    await supabase
      .from("organizations")
      .update({ name: editingOrgName.trim() })
      .eq("id", userOrgId);

    setOrgName(editingOrgName.trim());
    setIsEditingOrgName(false);
  };

  const handleOrgNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveOrgName();
    } else if (e.key === "Escape") {
      setIsEditingOrgName(false);
    }
  };

  const copyToClipboard = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(itemName);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const sidebarWidth = isHydrated ? (isExpanded ? 220 : 56) : 220;

  return (
    <>
      {/* Header */}
      <header
        className="fixed top-0 right-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border"
        style={{
          left: sidebarWidth,
          transition: "left 0.2s ease"
        }}
      >
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            {/* Breadcrumb navigation */}
            <Link
              href="/organizations"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Organizations
            </Link>
            {showOrgBreadcrumb && orgName && (
              <>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                {isEditingOrgName ? (
                  <Input
                    value={editingOrgName}
                    onChange={(e) => setEditingOrgName(e.target.value)}
                    onBlur={saveOrgName}
                    onKeyDown={handleOrgNameKeyDown}
                    className="text-sm font-medium h-7 w-auto border-none shadow-none focus-visible:ring-0 px-1"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={startEditingOrgName}
                    className="text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
                    title="Click to edit"
                  >
                    {orgName}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowSetupModal(true)}
            >
              <Key className="w-3 h-3 mr-2" />
              Setup Brief
            </Button>
          </div>
        </div>
      </header>

      {/* Setup Modal */}
      <Dialog open={showSetupModal} onOpenChange={(open) => { setShowSetupModal(open); if (!open) setSelectedAgent(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedAgent ? "Configure Brief" : "Select your AI agent"}
            </DialogTitle>
          </DialogHeader>

          {!selectedAgent ? (
            <div className="grid grid-cols-2 gap-3">
              {AGENTS.map((agent) => (
                <Button
                  key={agent.id}
                  variant="outline"
                  className="flex items-center justify-start gap-3 h-auto p-4"
                  onClick={() => setSelectedAgent(agent.id)}
                >
                  <div className="w-10 h-10 bg-muted flex items-center justify-center overflow-hidden">
                    {agent.icon ? (
                      <Image src={agent.icon} alt={agent.name} width={28} height={28} className="object-contain" />
                    ) : (
                      <span className="text-muted-foreground font-bold text-lg">?</span>
                    )}
                  </div>
                  <span className="text-sm font-medium">{agent.name}</span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAgent(null)}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Change agent
              </Button>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-foreground text-background text-xs font-medium flex items-center justify-center">1</span>
                  <span className="text-sm font-medium">Install Brief CLI</span>
                </div>
                <div
                  className="relative group cursor-pointer"
                  onClick={() => copyToClipboard("uv tool install brief-cli --from git+https://github.com/marlowetal653/briefkit.git", "install")}
                >
                  <div className="bg-foreground text-background px-4 py-3 font-mono text-xs overflow-x-auto">
                    <span className="text-muted-foreground">$</span> uv tool install brief-cli --from git+https://github.com/marlowetal653/briefkit.git
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedItem === "install" ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-foreground text-background text-xs font-medium flex items-center justify-center">2</span>
                  <span className="text-sm font-medium">Initialize in your project</span>
                </div>
                <div
                  className="relative group cursor-pointer"
                  onClick={() => copyToClipboard(`brief init . --ai ${getAgentById(selectedAgent)?.cliArg}`, "init")}
                >
                  <div className="bg-foreground text-background px-4 py-3 font-mono text-sm">
                    <span className="text-muted-foreground">$</span> brief init . --ai {getAgentById(selectedAgent)?.cliArg}
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedItem === "init" ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Your access token</span>
                  <span className="text-xs text-muted-foreground">The CLI will ask for this</span>
                </div>
                <div
                  className="relative group cursor-pointer"
                  onClick={() => copyToClipboard(mcpToken, "token")}
                >
                  <div className="bg-muted border border-border px-4 py-3 font-mono text-sm text-foreground truncate pr-20">
                    {mcpToken}
                  </div>
                  <Button
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    {copiedItem === "token" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
