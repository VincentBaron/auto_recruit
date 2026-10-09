import type { Metadata } from "next";
import { NicheDetail } from "@/components/screens/setup/niche-detail";

export const metadata: Metadata = { title: "Niche Profile" };

export default async function NichePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NicheDetail nicheId={id} />;
}
