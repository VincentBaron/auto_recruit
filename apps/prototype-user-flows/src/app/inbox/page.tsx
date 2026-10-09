import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxScreen, InboxSkeleton } from "@/components/screens/inbox/inbox-screen";

export const metadata: Metadata = { title: "Inbox" };

// The reply, Reply Category, status and Campaign filters are read on the client with useSearchParams
// (the URL is their only source of truth, so Back restores them), hence the Suspense.
export default function InboxPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxScreen />
    </Suspense>
  );
}
