import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedScreen } from "@/components/screens/feed/feed-screen";
import { FeedSkeleton } from "@/components/screens/feed/skeleton";

export const metadata: Metadata = {
  title: "Feed",
};

// Variant, tab, Niche and view are read on the client with useSearchParams, hence the Suspense.
export default function FeedPage() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <FeedScreen />
    </Suspense>
  );
}
