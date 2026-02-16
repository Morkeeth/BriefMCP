"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

// Legacy page - redirects to /organizations
export default function SelectOrgPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/organizations");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Spinner size="lg" className="text-foreground" />
    </div>
  );
}
