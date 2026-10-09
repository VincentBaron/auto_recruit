import type { Metadata } from "next";
import { CreditsScreen } from "@/components/screens/testrun/credits-screen";
import { safeReturnTo } from "@/components/screens/testrun/model";

export const metadata: Metadata = { title: "Credits" };

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { returnTo } = await searchParams;
  return <CreditsScreen returnTo={safeReturnTo(returnTo)} />;
}
