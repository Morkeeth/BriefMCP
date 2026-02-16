"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface Organization {
  id: string;
  name: string;
  slug: string;
  invite_code: string | null;
}

interface UseOrganizationReturn {
  organization: Organization | null;
  userRole: string | null;
  mcpToken: string | null;
  loading: boolean;
  isAdmin: boolean;
  refreshOrganization: () => Promise<void>;
}

export function useOrganization(userId: string | null): UseOrganizationReturn {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let isMounted = true;

    const loadOrganization = async () => {
      if (!userId) {
        if (isMounted) setLoading(false);
        return;
      }

      // Get user data with org_id, mcp_token, role
      const { data: userData } = await supabase
        .from("users")
        .select("org_id, mcp_token, role")
        .eq("id", userId)
        .single();

      if (!isMounted) return;

      if (!userData?.org_id) {
        setLoading(false);
        return;
      }

      setMcpToken(userData.mcp_token as string | null);
      setUserRole(userData.role as string | null);

      // Get organization details
      const { data: orgData } = await supabase
        .from("organizations")
        .select("id, name, slug, invite_code")
        .eq("id", userData.org_id)
        .single();

      if (!isMounted) return;

      if (orgData) {
        setOrganization(orgData as Organization);
      }

      setLoading(false);
    };

    loadOrganization();

    return () => {
      isMounted = false;
    };
  }, [userId, supabase, refreshKey]);

  const refreshOrganization = useCallback(async () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const isAdmin = userRole === "admin";

  return {
    organization,
    userRole,
    mcpToken,
    loading,
    isAdmin,
    refreshOrganization,
  };
}
