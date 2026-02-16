"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Building2, Plus, Check, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface UserOrganization {
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

export default function OrganizationsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
  const [orgToLeave, setOrgToLeave] = useState<UserOrganization | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      const { data: userData } = await supabase
        .from("users")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (userData?.org_id) {
        setCurrentOrgId(userData.org_id);
      }

      const { data: orgs } = await supabase.rpc("get_user_organizations", {
        p_user_id: user.id
      });

      if (orgs) setUserOrganizations(orgs);

      setLoading(false);
    };

    loadData();
  }, [supabase, router]);

  const handleSwitchOrg = async (org: UserOrganization) => {
    if (!currentUserId) return;

    const { error } = await supabase.rpc("switch_default_organization", {
      p_user_id: currentUserId,
      p_new_org_id: org.id
    });

    if (error) {
      await supabase
        .from("users")
        .update({ org_id: org.id })
        .eq("id", currentUserId);
    }

    setUserOrganizations(prev => prev.map(o => ({
      ...o,
      is_default: o.id === org.id
    })));
    setCurrentOrgId(org.id);
    router.refresh();
  };

  const handleLeaveOrg = async (org: UserOrganization) => {
    if (!currentUserId) return;

    const { data: result, error } = await supabase.rpc("leave_organization", {
      p_user_id: currentUserId,
      p_org_id: org.id
    });

    if (error) {
      alert("Error: " + error.message);
      return;
    }

    setUserOrganizations(prev => prev.filter(o => o.id !== org.id));
    setOrgToLeave(null);

    if (result?.remaining_orgs === 0) {
      router.push("/organizations");
    } else if (org.is_default || org.id === currentOrgId) {
      router.refresh();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Organizations List */}
      <div className="space-y-3">
        {userOrganizations.map((org) => (
          <Card
            key={org.id}
            className={org.is_default ? "ring-1 ring-foreground/20" : ""}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{org.name}</span>
                      {org.is_default && (
                        <Badge className="gap-1">
                          <Check className="w-3 h-3" />
                          Current
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {org.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {org.member_count} member{org.member_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!org.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSwitchOrg(org)}
                    >
                      Switch
                    </Button>
                  )}
                  {userOrganizations.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setOrgToLeave(org)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <DoorOpen className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Organization Button */}
      <Card
        className="border-dashed cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => router.push('/organizations')}
      >
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center">
              <Plus className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <span className="font-medium text-foreground">Add organization</span>
              <p className="text-sm text-muted-foreground">
                Create a new organization or join an existing one
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Organization Dialog */}
      <Dialog open={!!orgToLeave} onOpenChange={(open) => !open && setOrgToLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave organization?</DialogTitle>
            <DialogDescription>
              You will leave <strong>{orgToLeave?.name}</strong> and lose access to all
              its documents. You can still access your other organizations.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOrgToLeave(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => orgToLeave && handleLeaveOrg(orgToLeave)}
            >
              Leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
