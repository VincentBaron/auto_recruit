import type { Metadata } from "next";
import { TestRunScreen } from "@/components/screens/testrun/test-run-screen";

export const metadata: Metadata = { title: "Test Run" };

export default async function TestRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TestRunScreen nicheId={id} />;
}
