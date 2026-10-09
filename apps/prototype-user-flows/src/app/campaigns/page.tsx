import type { Metadata } from "next";
import { CampaignsList } from "@/components/screens/campaigns/campaigns-list";

export const metadata: Metadata = { title: "Campaigns" };

export default function CampaignsPage() {
  return <CampaignsList />;
}
