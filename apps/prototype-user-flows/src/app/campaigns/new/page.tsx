import type { Metadata } from "next";
import { CampaignWizard } from "@/components/screens/campaigns/campaign-wizard";
import type { WizardPrefill } from "@/components/screens/campaigns/wizard-model";

export const metadata: Metadata = { title: "New Campaign" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Optional prefill from other screens:
 * `?nicheId=ni_fintech&audience=candidates&detectedRoleId=dr_x&people=candidate:c_1,candidate:c_2`.
 */
export default async function NewCampaignPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const audience = one(sp.audience);
  const prefill: WizardPrefill = {
    nicheId: one(sp.nicheId) ?? one(sp.niche),
    audience: audience === "candidates" || audience === "hiring_contacts" ? audience : undefined,
    detectedRoleId: one(sp.detectedRoleId) ?? one(sp.role),
    people: (one(sp.people) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  return <CampaignWizard prefill={prefill} />;
}
