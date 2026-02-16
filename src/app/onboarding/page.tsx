"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

// Onboarding now redirects to /organizations which has the dialog integrated
export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/organizations");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Spinner className="text-foreground" />
    </div>
  );
}
