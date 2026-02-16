"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { CreditCard, Users, Calendar, ExternalLink, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface BillingInfo {
  plan: 'free' | 'pro';
  seats: number;
  billingCycle: 'monthly' | 'yearly';
  nextBillingDate: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

const PRICE_PER_SEAT = 10;

export default function BillingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [billingInfo, setBillingInfo] = useState<BillingInfo>({
    plan: 'free',
    seats: 1,
    billingCycle: 'monthly',
    nextBillingDate: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });
  const [memberCount, setMemberCount] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("org_id, role")
        .eq("id", user.id)
        .single();

      if (!userData?.org_id) {
        router.push('/organizations');
        return;
      }

      setIsAdmin(userData.role === 'admin');

      // Get organization billing info
      const { data: orgData } = await supabase
        .from("organizations")
        .select("settings, stripe_customer_id, stripe_subscription_id")
        .eq("id", userData.org_id)
        .single();

      if (orgData) {
        const settings = orgData.settings || {};
        setBillingInfo({
          plan: settings.plan || 'free',
          seats: settings.seats || 1,
          billingCycle: settings.billing_cycle || 'monthly',
          nextBillingDate: settings.next_billing_date || null,
          stripeCustomerId: orgData.stripe_customer_id,
          stripeSubscriptionId: orgData.stripe_subscription_id,
        });
      }

      // Get member count
      const { count } = await supabase
        .from("users")
        .select("id", { count: 'exact', head: true })
        .eq("org_id", userData.org_id);

      setMemberCount(count || 1);
      setLoading(false);
    };

    loadData();
  }, [supabase, router]);

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          seats: Math.max(memberCount, 1),
        }),
      });

      const { url, error } = await response.json();
      if (error) {
        alert(error);
        return;
      }

      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      alert('Failed to create checkout session');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    setIsManaging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const { url, error } = await response.json();
      if (error) {
        alert(error);
        return;
      }

      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error creating portal:', error);
      alert('Failed to open billing portal');
    } finally {
      setIsManaging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  const isPro = billingInfo.plan === 'pro';
  const monthlyTotal = billingInfo.seats * PRICE_PER_SEAT;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Current Plan */}
      <Card className={cn(isPro && "ring-1 ring-foreground/20")}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                isPro ? "bg-foreground" : "bg-muted"
              )}>
                <Zap className={cn(
                  "w-6 h-6",
                  isPro ? "text-background" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground text-lg">
                    {isPro ? 'Pro Plan' : 'Free Plan'}
                  </h3>
                  {isPro && (
                    <Badge className="bg-foreground text-background">Active</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {isPro
                    ? `${billingInfo.seats} seat${billingInfo.seats !== 1 ? 's' : ''} · $${monthlyTotal}/month`
                    : 'Limited features · Up to 3 members'
                  }
                </p>
              </div>
            </div>

            {isAdmin && (
              <div>
                {isPro ? (
                  <Button
                    variant="outline"
                    onClick={handleManageBilling}
                    disabled={isManaging}
                    className="gap-2"
                  >
                    {isManaging ? (
                      <Spinner size="sm" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    Manage billing
                  </Button>
                ) : (
                  <Button
                    onClick={handleUpgrade}
                    disabled={isUpgrading}
                    className="gap-2"
                  >
                    {isUpgrading ? (
                      <Spinner size="sm" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    Upgrade to Pro
                  </Button>
                )}
              </div>
            )}
          </div>

          {isPro && billingInfo.nextBillingDate && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  Next billing date: {new Date(billingInfo.nextBillingDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Comparison */}
      {!isPro && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Free Plan */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4">
                <h4 className="font-semibold text-foreground">Free</h4>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  'Up to 3 team members',
                  '100 queries/month',
                  'Basic AI models',
                  'Community support',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-muted-foreground" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full mt-6" disabled>
                Current plan
              </Button>
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className="ring-1 ring-foreground/20">
            <CardContent className="p-6">
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-foreground">Pro</h4>
                  <Badge variant="secondary">Recommended</Badge>
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">${PRICE_PER_SEAT}</span>
                  <span className="text-muted-foreground">/seat/month</span>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  'Unlimited team members',
                  'Unlimited queries',
                  'All AI models',
                  'Priority support',
                  'Advanced analytics',
                  'Custom integrations',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-foreground" />
                    {feature}
                  </li>
                ))}
              </ul>
              {isAdmin ? (
                <Button
                  className="w-full mt-6"
                  onClick={handleUpgrade}
                  disabled={isUpgrading}
                >
                  {isUpgrading ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Upgrade · ${memberCount * PRICE_PER_SEAT}/mo
                    </>
                  )}
                </Button>
              ) : (
                <Button className="w-full mt-6" disabled>
                  Contact admin to upgrade
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Usage Stats */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-4">Current usage</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Team members</div>
                <div className="font-semibold text-foreground">{memberCount}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Monthly cost</div>
                <div className="font-semibold text-foreground">
                  {isPro ? `$${monthlyTotal}` : 'Free'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Only workspace admins can manage billing settings.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
