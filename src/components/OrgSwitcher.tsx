"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check, Plus, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

interface OrgSwitcherProps {
  isExpanded: boolean;
  className?: string;
}

export function OrgSwitcher({ isExpanded, className = "" }: OrgSwitcherProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadOrganizations();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadOrganizations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get organizations from RPC
      const { data: orgs, error } = await supabase
        .rpc("get_user_organizations", { p_user_id: user.id });

      if (error) {
        console.error("[OrgSwitcher] Error loading orgs:", error);
        // Fallback to single org from users table
        const { data: userData } = await supabase
          .from("users")
          .select("org_id, role")
          .eq("id", user.id)
          .single();

        if (userData?.org_id) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("id, name, slug")
            .eq("id", userData.org_id)
            .single();

          if (orgData) {
            const singleOrg: Organization = {
              id: orgData.id,
              name: orgData.name,
              slug: orgData.slug,
              ref: orgData.slug,
              role: userData.role || "member",
              api_key: "",
              is_default: true,
              member_count: 1,
              joined_at: new Date().toISOString(),
            };
            setOrganizations([singleOrg]);
            setCurrentOrg(singleOrg);
          }
        }
      } else if (orgs && orgs.length > 0) {
        setOrganizations(orgs);
        const defaultOrg = orgs.find((o: Organization) => o.is_default) || orgs[0];
        setCurrentOrg(defaultOrg);
      }
    } catch (error) {
      console.error("[OrgSwitcher] Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchOrg = async (org: Organization) => {
    if (org.id === currentOrg?.id) {
      setIsOpen(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Call RPC to switch default organization
      const { error } = await supabase
        .rpc("switch_default_organization", {
          p_user_id: user.id,
          p_new_org_id: org.id,
        });

      if (error) {
        console.error("[OrgSwitcher] Switch error:", error);
        // Fallback: directly update users table
        await supabase
          .from("users")
          .update({ org_id: org.id })
          .eq("id", user.id);
      }

      // Update local state
      setCurrentOrg(org);
      setOrganizations(prev =>
        prev.map(o => ({
          ...o,
          is_default: o.id === org.id,
        }))
      );

      setIsOpen(false);

      // Navigate to the new org's dashboard (ref or id fallback)
      const orgIdentifier = org.ref || org.id;
      router.push(`/dashboard/org/${orgIdentifier}`);
    } catch (error) {
      console.error("[OrgSwitcher] Error switching org:", error);
    }
  };

  const handleAddOrg = () => {
    setIsOpen(false);
    router.push("/organizations");
  };

  if (loading) {
    return (
      <div className={`px-2 py-2 ${className}`}>
        <div className="animate-pulse bg-gray-200 rounded-lg h-10"></div>
      </div>
    );
  }

  if (!currentOrg) {
    return null;
  }

  // If only one org and sidebar is collapsed, just show icon
  if (!isExpanded && organizations.length <= 1) {
    return (
      <div className={`px-2 py-2 ${className}`}>
        <div
          className="p-2 rounded-lg bg-gray-100 flex items-center justify-center"
          title={currentOrg.name}
        >
          <Building2 className="w-5 h-5 text-gray-600" />
        </div>
      </div>
    );
  }

  return (
    <div className={`px-2 py-2 relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-all ${
          isOpen ? "ring-2 ring-gray-300" : ""
        }`}
      >
        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-gray-600" />
        </div>
        {isExpanded && (
          <>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {currentOrg.name}
              </p>
              {organizations.length > 1 && (
                <p className="text-xs text-gray-500">
                  {organizations.length} organizations
                </p>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden ${
              isExpanded ? "left-2 right-2" : "left-2 w-56"
            }`}
          >
            <div className="py-1 max-h-64 overflow-y-auto">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitchOrg(org)}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors ${
                    org.id === currentOrg?.id ? "bg-gray-50" : ""
                  }`}
                >
                  <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {org.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {org.role} · {org.member_count} member{org.member_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {org.id === currentOrg?.id && (
                    <Check className="w-4 h-4 text-gray-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-gray-200">
              <button
                onClick={handleAddOrg}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-gray-600"
              >
                <div className="w-7 h-7 rounded-md border border-dashed border-gray-300 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-sm">Add organization</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/settings?tab=organizations");
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-gray-600"
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center">
                  <Settings className="w-4 h-4" />
                </div>
                <span className="text-sm">Manage organizations</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
