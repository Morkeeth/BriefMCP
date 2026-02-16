import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user exists in users table
      const { data: existingUser, error: userError } = await supabase
        .from("users")
        .select("id, org_id")
        .eq("id", data.user.id)
        .single();

      console.log("[Auth Callback] User ID:", data.user.id);
      console.log("[Auth Callback] existingUser:", existingUser);
      console.log("[Auth Callback] userError:", userError);

      // Extract avatar URL from OAuth provider metadata
      const avatarUrl = data.user.user_metadata?.avatar_url
        || data.user.user_metadata?.picture
        || null;

      // If user doesn't exist in users table, create them (OAuth signup)
      if (!existingUser) {
        await supabase.from("users").insert({
          id: data.user.id,
          email: data.user.email,
          avatar_url: avatarUrl,
        });
        // New OAuth user, redirect to onboarding
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      // Update avatar_url for existing users (in case they changed their profile picture)
      if (avatarUrl) {
        await supabase
          .from("users")
          .update({ avatar_url: avatarUrl })
          .eq("id", data.user.id);
      }

      // Check organization memberships for multi-org support
      const { data: memberships, error: membershipsError } = await supabase
        .rpc("get_user_organizations", { p_user_id: data.user.id });

      console.log("[Auth Callback] Memberships:", memberships?.length || 0);

      if (membershipsError) {
        console.log("[Auth Callback] Memberships error:", membershipsError);
        // Fallback to legacy single-org check
        if (existingUser.org_id) {
          return NextResponse.redirect(`${origin}${next || "/dashboard"}`);
        } else {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      const membershipCount = memberships?.length || 0;

      if (membershipCount === 0) {
        // No organizations, redirect to onboarding
        return NextResponse.redirect(`${origin}/onboarding`);
      }

      // Always redirect to /organizations - let user choose which org to enter
      return NextResponse.redirect(`${origin}${next || "/organizations"}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
