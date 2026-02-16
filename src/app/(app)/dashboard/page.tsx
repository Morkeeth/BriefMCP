"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

export default function DashboardRedirect() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const redirect = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Get user's default organization
      const { data: userData } = await supabase
        .from("users")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!userData?.org_id) {
        router.push("/organizations");
        return;
      }

      // Get the org ref (fallback to id)
      const { data: orgData } = await supabase
        .from("organizations")
        .select("ref")
        .eq("id", userData.org_id)
        .single();

      const orgIdentifier = orgData?.ref || userData.org_id;
      router.replace(`/dashboard/org/${orgIdentifier}`);
    };

    redirect();
  }, [supabase, router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Spinner className="text-foreground" />
    </div>
  );
}
