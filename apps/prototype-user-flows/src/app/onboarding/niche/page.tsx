import type { Metadata } from "next";
import { Suspense } from "react";
import { NicheSetup } from "@/components/screens/setup/niche-setup";
import { PageSkeleton } from "@/components/screens/setup/shared";

export const metadata: Metadata = { title: "Niche setup" };

// Variant A "Chat" / B "Wizard" (?variant=) and the draft Niche (?niche=) are read on the client with
// useSearchParams, hence the Suspense.
export default function NicheSetupPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="split" />}>
      <NicheSetup />
    </Suspense>
  );
}
