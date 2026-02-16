import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check organization memberships for multi-org support
  const { data: memberships, error: membershipsError } = await supabase
    .rpc("get_user_organizations", { p_user_id: user.id });

  if (membershipsError) {
    // Fallback to legacy check
    const { data: userData } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!userData?.org_id) {
      redirect("/organizations");
    }
  } else {
    const membershipCount = memberships?.length || 0;

    if (membershipCount === 0) {
      redirect("/organizations");
    }
  }

  return <AppShell>{children}</AppShell>;
}
