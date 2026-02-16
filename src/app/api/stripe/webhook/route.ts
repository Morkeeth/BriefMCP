import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
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
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "subscription" && session.subscription) {
          const subscriptionResponse = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          const subscription = subscriptionResponse as unknown as Stripe.Subscription;

          const orgId = subscription.metadata.org_id;

          if (orgId) {
            const { data: orgData } = await supabase
              .from("organizations")
              .select("settings")
              .eq("id", orgId)
              .single();

            const currentSettings = orgData?.settings || {};
            const quantity = subscription.items.data[0]?.quantity || 1;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const periodEnd = (subscription as any).current_period_end as number;

            await supabase
              .from("organizations")
              .update({
                stripe_subscription_id: subscription.id,
                settings: {
                  ...currentSettings,
                  plan: "pro",
                  seats: quantity,
                  billing_cycle: subscription.items.data[0]?.price.recurring?.interval || "month",
                  next_billing_date: new Date(periodEnd * 1000).toISOString(),
                },
              })
              .eq("id", orgId);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata.org_id;

        if (orgId) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("settings")
            .eq("id", orgId)
            .single();

          const currentSettings = orgData?.settings || {};
          const quantity = subscription.items.data[0]?.quantity || 1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const periodEnd = (subscription as any).current_period_end as number;

          await supabase
            .from("organizations")
            .update({
              settings: {
                ...currentSettings,
                plan: subscription.status === "active" ? "pro" : "free",
                seats: quantity,
                billing_cycle: subscription.items.data[0]?.price.recurring?.interval || "month",
                next_billing_date: new Date(periodEnd * 1000).toISOString(),
              },
            })
            .eq("id", orgId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata.org_id;

        if (orgId) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("settings")
            .eq("id", orgId)
            .single();

          const currentSettings = orgData?.settings || {};

          await supabase
            .from("organizations")
            .update({
              stripe_subscription_id: null,
              settings: {
                ...currentSettings,
                plan: "free",
                seats: 1,
                next_billing_date: null,
              },
            })
            .eq("id", orgId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.error("Payment failed for invoice:", invoice.id);
        // Could send notification email here
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
