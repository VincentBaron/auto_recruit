import type { Metadata } from "next";
import { ConsentInvalidScreen } from "@/components/screens/inbox/consent-screen";

// A Consent Page link with its token cut off (/consent or /consent/): the neutral invalid-link page,
// with no app chrome and no Workspace identity.
export const metadata: Metadata = { title: { absolute: "This link is no longer valid" }, robots: { index: false, follow: false } };

export default function ConsentWithoutTokenPage() {
  return <ConsentInvalidScreen />;
}
