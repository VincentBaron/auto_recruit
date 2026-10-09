import type { Metadata } from "next";
import { ProspectScreen } from "@/components/screens/people/prospect-detail";

export const metadata: Metadata = { title: "Prospect" };

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProspectScreen id={id} />;
}
