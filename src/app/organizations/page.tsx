"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Users, ChevronRight, Plus, UserPlus, LogOut, Key, Copy, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

interface Organization {
  id: string;
  name: string;
  slug: string;
  ref: string | null;
  role: string;
  api_key: string;
  is_default: boolean;
  member_count: number;
  joined_at: string;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Onboarding dialog state
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    setUser(user);

    const { data: userData } = await supabase
      .from("users")
      .select("mcp_token")
      .eq("id", user.id)
      .single();

    if (userData?.mcp_token) {
      setApiKey(userData.mcp_token);
    }

    const { data: orgs, error } = await supabase
      .rpc("get_user_organizations", { p_user_id: user.id });

    if (error) {
      console.error("[Organizations] Error loading orgs:", error);
    } else if (orgs) {
      setOrganizations(orgs);
    }

    setLoading(false);
  };

  const copyApiKey = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnterOrg = async (org: Organization) => {
    setSwitching(org.id);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .rpc("switch_default_organization", {
        p_user_id: user.id,
        p_new_org_id: org.id,
      });

    if (error) {
      console.error("[Organizations] Switch error:", error);
      await supabase
        .from("users")
        .update({ org_id: org.id })
        .eq("id", user.id);
    }

    // Navigate to the org's dashboard with its ref (fallback to id)
    const orgIdentifier = org.ref || org.id;
    router.push(`/dashboard/org/${orgIdentifier}`);
    router.refresh();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingLoading(true);
    setOnboardingError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setOnboardingError("You must be logged in");
      setOnboardingLoading(false);
      return;
    }

    if (onboardingMode === "create") {
      if (!orgName.trim()) {
        setOnboardingError("Organization name is required");
        setOnboardingLoading(false);
        return;
      }

      const { error: upsertUserError } = await supabase
        .from("users")
        .upsert(
          { id: user.id, email: user.email },
          { onConflict: 'id', ignoreDuplicates: true }
        );

      if (upsertUserError) {
        console.error("[Onboarding] Error upserting user:", upsertUserError);
      }

      const slug =
        orgName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") +
        "-" +
        Math.random().toString(36).substring(2, 8);

      const { data: newOrg, error: orgError } = await supabase
        .rpc("create_organization_for_user", {
          org_name: orgName.trim(),
          org_slug: slug,
          user_id: user.id
        });

      if (orgError || !newOrg || newOrg.length === 0) {
        setOnboardingError(`Error creating organization: ${orgError?.message || 'Unknown error'}`);
        setOnboardingLoading(false);
        return;
      }
    } else {
      if (!inviteCode.trim() || inviteCode.length !== 6) {
        setOnboardingError("Code must be 6 digits");
        setOnboardingLoading(false);
        return;
      }

      const { error: upsertUserError } = await supabase
        .from("users")
        .upsert(
          { id: user.id, email: user.email },
          { onConflict: 'id', ignoreDuplicates: true }
        );

      if (upsertUserError) {
        console.error("[Onboarding] Error upserting user:", upsertUserError);
      }

      const { data: result, error: joinError } = await supabase
        .rpc("join_organization_by_code", {
          invite_code_input: inviteCode.trim(),
          user_id: user.id
        });

      if (joinError || !result) {
        setOnboardingError("Invalid code. Please check and try again.");
        setOnboardingLoading(false);
        return;
      }
    }

    setShowOnboardingDialog(false);
    setOrgName("");
    setInviteCode("");
    setOnboardingLoading(false);
    loadOrganizations();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/brief.png" alt="Brief" width={72} height={24} className="h-6 w-auto" />
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-screen pt-20 pb-12 px-6 flex items-center justify-center">
        <div className="max-w-3xl w-full">
          {/* Page Header */}
          <div className="text-center mb-10">
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Your organizations
            </h1>
            <p className="text-muted-foreground text-sm">
              Select a workspace to continue
            </p>
          </div>

          {/* API Key Section */}
          {apiKey && (
            <Card className="mb-8">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center">
                    <Key className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground text-sm">Your API Key</h3>
                    <p className="text-xs text-muted-foreground">Use this key to access all your organizations</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted border border-border px-4 py-3 font-mono text-sm text-foreground overflow-hidden">
                    {showApiKey
                      ? apiKey
                      : `${apiKey.substring(0, 8)}${'•'.repeat(24)}${apiKey.substring(apiKey.length - 8)}`}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="default"
                    size="icon"
                    onClick={copyApiKey}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Organizations Grid */}
          {organizations.length > 0 ? (
            <>
              <div className="grid gap-2">
                {organizations.map((org) => (
                  <Card
                    key={org.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-accent group",
                      switching === org.id && "opacity-70",
                      switching !== null && switching !== org.id && "opacity-50"
                    )}
                    onClick={() => handleEnterOrg(org)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-foreground">
                              {org.name}
                            </span>
                            {org.is_default && (
                              <span className="text-xs text-muted-foreground">
                                Last used
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-normal">
                              {org.role}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="w-3 h-3" />
                              {org.member_count} member{org.member_count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-4">
                          {switching === org.id ? (
                            <Spinner size="sm" className="text-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Add more actions */}
              <div className="mt-6">
                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => setShowOnboardingDialog(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add organization
                </Button>
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="text-center py-8">
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <Button
                  className="flex-1"
                  onClick={() => {
                    setOnboardingMode("create");
                    setShowOnboardingDialog(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create organization
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setOnboardingMode("join");
                    setShowOnboardingDialog(true);
                  }}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Join with code
                </Button>
              </div>
            </div>
          )}

          {/* User Info */}
          {user && (
            <p className="mt-8 text-xs text-muted-foreground text-center">
              Signed in as <span className="text-foreground">{user.email}</span>
            </p>
          )}
        </div>
      </main>

      {/* Onboarding Dialog */}
      <Dialog open={showOnboardingDialog} onOpenChange={setShowOnboardingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {onboardingMode === "create" ? "Create organization" : "Join organization"}
            </DialogTitle>
            <DialogDescription>
              {onboardingMode === "create"
                ? "Create a new organization to get started."
                : "Enter the 6-digit invite code to join."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleOnboardingSubmit} className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={onboardingMode === "create" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setOnboardingMode("create")}
              >
                Create
              </Button>
              <Button
                type="button"
                variant={onboardingMode === "join" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setOnboardingMode("join")}
              >
                Join
              </Button>
            </div>

            <Separator />

            {/* Error */}
            {onboardingError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {onboardingError}
              </div>
            )}

            {/* Input */}
            {onboardingMode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="My company"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="inviteCode">Invite code</Label>
                <Input
                  id="inviteCode"
                  value={inviteCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setInviteCode(value);
                  }}
                  placeholder="000000"
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                />
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={onboardingLoading}>
              {onboardingLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" className="text-primary-foreground" />
                  Loading...
                </span>
              ) : onboardingMode === "create" ? (
                "Create organization"
              ) : (
                "Join"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
