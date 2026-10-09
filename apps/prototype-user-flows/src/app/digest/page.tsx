import type { Metadata } from "next";
import { Suspense } from "react";
import { DigestScreen, DigestSkeleton } from "@/components/screens/inbox/digest-screen";

export const metadata: Metadata = { title: "Digest" };

// The Digest shown (?on=) is read on the client with useSearchParams, hence the Suspense.
export default function DigestPage() {
  return (
    <Suspense fallback={<DigestSkeleton />}>
      <DigestScreen />
    </Suspense>
  );
}
