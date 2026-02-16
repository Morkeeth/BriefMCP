"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ChevronDown, X, Copy, Check, UserPlus } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type UserRole = 'admin' | 'member' | 'viewer';

interface TeamMember {
  id: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
}

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Full access to all settings' },
  { value: 'member', label: 'Member', description: 'Can edit documents' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
];

export default function TeamSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [openRoleDropdown, setOpenRoleDropdown] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [copied, setCopied] = useState(false);

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
        .select("org_id, role")
        .eq("id", user.id)
        .single();

      if (!userData?.org_id) {
        router.push('/organizations');
        return;
      }

      setUserRole(userData.role);
      setCurrentOrgId(userData.org_id);

      const { data: orgData } = await supabase
        .from("organizations")
        .select("name, invite_code")
        .eq("id", userData.org_id)
        .single();

      if (orgData) {
        setOrgName(orgData.name);
        if (orgData.invite_code) setInviteCode(orgData.invite_code);
      }

      // Use RPC to bypass RLS issues
      const { data: membersData } = await supabase.rpc('get_org_members', {
        p_org_id: userData.org_id
      });

      if (membersData) {
        const members: TeamMember[] = membersData.map((m: { user_id: string; email: string; role: string; avatar_url: string | null; joined_at: string }) => ({
          id: m.user_id,
          email: m.email,
          role: m.role,
          avatar_url: m.avatar_url,
          created_at: m.joined_at,
        }));
        setTeamMembers(members);
      }

      setLoading(false);
    };

    loadData();
  }, [supabase, router]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!isAdmin || userId === currentUserId || !currentOrgId) return;

    if (newRole !== 'admin') {
      const adminCount = teamMembers.filter(m => m.role === 'admin').length;
      const isTargetAdmin = teamMembers.find(m => m.id === userId)?.role === 'admin';
      if (adminCount === 1 && isTargetAdmin) {
        alert("Cannot remove the last admin.");
        return;
      }
    }

    // Update role in organization_members (source of truth for multi-org)
    const { error } = await supabase
      .from("organization_members")
      .update({ role: newRole })
      .eq("user_id", userId)
      .eq("org_id", currentOrgId);

    if (!error) {
      setTeamMembers(prev => prev.map(m =>
        m.id === userId ? { ...m, role: newRole } : m
      ));
    }
    setOpenRoleDropdown(null);
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (!isAdmin || member.id === currentUserId || !currentOrgId) return;

    if (member.role === 'admin') {
      const adminCount = teamMembers.filter(m => m.role === 'admin').length;
      if (adminCount === 1) {
        alert("Cannot remove the last admin.");
        return;
      }
    }

    // Use leave_organization RPC to properly handle multi-org cleanup
    const { error } = await supabase.rpc('leave_organization', {
      p_user_id: member.id,
      p_org_id: currentOrgId,
    });

    if (!error) {
      setTeamMembers(prev => prev.filter(m => m.id !== member.id));
    }
    setMemberToRemove(null);
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isAdmin = userRole === 'admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Invite Section */}
      {inviteCode && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-muted flex items-center justify-center rounded-lg">
                  <UserPlus className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Invite teammates</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Share this code to invite people to {orgName}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyInviteCode}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy code
                  </>
                )}
              </Button>
            </div>
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <code className="text-sm font-mono text-foreground">{inviteCode}</code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Members ({teamMembers.length})
          </h3>
        </div>

        <div className="space-y-2">
          {teamMembers.map((member) => {
            const isCurrentUser = member.id === currentUserId;

            return (
              <Card key={member.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {member.avatar_url ? (
                        <Image
                          src={member.avatar_url}
                          alt={member.email}
                          width={40}
                          height={40}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-muted-foreground">
                            {member.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {member.email}
                          </span>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Joined {new Date(member.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAdmin && !isCurrentUser && member.role !== 'admin' ? (
                        <div className="relative">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOpenRoleDropdown(
                              openRoleDropdown === member.id ? null : member.id
                            )}
                            className="gap-1"
                          >
                            {member.role}
                            <ChevronDown className="w-3 h-3" />
                          </Button>

                          {openRoleDropdown === member.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-background border border-border rounded-lg shadow-lg py-1 z-10">
                              {ROLE_OPTIONS.map((role) => (
                                <button
                                  key={role.value}
                                  onClick={() => {
                                    if (role.value === 'admin') {
                                      if (window.confirm(
                                        `Promote ${member.email} to admin?\n\nThis action is irreversible.`
                                      )) {
                                        handleRoleChange(member.id, 'admin');
                                      }
                                      setOpenRoleDropdown(null);
                                    } else {
                                      handleRoleChange(member.id, role.value);
                                    }
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                                >
                                  <div className="text-sm font-medium">{role.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {role.description}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary">{member.role}</Badge>
                      )}

                      {isAdmin && !isCurrentUser && member.role !== 'admin' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setMemberToRemove(member)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Remove Member Dialog */}
      <Dialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              <strong>{memberToRemove?.email}</strong> will be removed from the organization
              and lose access to all documents.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setMemberToRemove(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => memberToRemove && handleRemoveMember(memberToRemove)}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
