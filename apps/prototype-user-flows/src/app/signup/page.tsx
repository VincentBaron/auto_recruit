import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupFlow, SignupSkeleton } from "@/components/screens/setup/signup";

export const metadata: Metadata = { title: "Sign up" };

// The provider (?provider=google|microsoft) is read on the client with useSearchParams, hence the Suspense.
export default function SignupPage() {
  return (
    <Suspense fallback={<SignupSkeleton />}>
      <SignupFlow />
    </Suspense>
  );
}
