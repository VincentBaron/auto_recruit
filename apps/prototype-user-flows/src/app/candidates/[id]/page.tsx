import type { Metadata } from "next";
import { CandidateScreen } from "@/components/screens/people/candidate-detail";

export const metadata: Metadata = { title: "Candidate" };

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CandidateScreen id={id} />;
}
