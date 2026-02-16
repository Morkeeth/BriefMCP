import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

let supabase: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const supabase = getSupabaseAdmin();

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { seats } = await request.json();

    // Get user's organization
    const { data: userData } = await supabase
      .from("users")
      .select("org_id, role")
      .eq("id", user.id)
      .single();

    if (!userData?.org_id || userData.role !== "admin") {
      return NextResponse.json({ error: "Only admins can manage billing" }, { status: 403 });
    }

    // Get organization
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id, name, stripe_customer_id")
      .eq("id", userData.org_id)
      .single();

    if (!orgData) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    let customerId = orgData.stripe_customer_id;

    // Create Stripe customer if not exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: orgData.name,
        metadata: {
          org_id: orgData.id,
          user_id: user.id,
        },
      });

      customerId = customer.id;

      // Save customer ID to organization
      await supabase
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", orgData.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: seats || 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
      subscription_data: {
        metadata: {
          org_id: orgData.id,
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
