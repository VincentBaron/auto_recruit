import type { Metadata } from "next";
import { NichesList } from "@/components/screens/setup/niches-list";

export const metadata: Metadata = { title: "Niches" };

export default function NichesPage() {
  return <NichesList />;
}
