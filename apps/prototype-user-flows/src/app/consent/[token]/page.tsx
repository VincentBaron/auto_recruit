import type { Metadata } from "next";
import { ConsentScreen } from "@/components/screens/inbox/consent-screen";

// Public, Candidate-facing page in the Workspace's name: no app chrome. The screen then sets the tab
// title and the document language to the language the Candidate reads in (FR/EN).
export const metadata: Metadata = { title: { absolute: "How we keep your details" }, robots: { index: false, follow: false } };

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConsentScreen token={token} />;
}
