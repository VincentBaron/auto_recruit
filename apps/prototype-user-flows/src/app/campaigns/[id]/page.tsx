import type { Metadata } from "next";
import { CampaignDetail, type DetailFlash, type DetailTab } from "@/components/screens/campaigns/campaign-detail";

export const metadata: Metadata = { title: "Campaign" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function num(v: string | string[] | undefined): number | undefined {
  const s = one(v);
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `?tab=review|recipients|settings`. The wizard adds `launched` or `created`, `skipped`, `addError` and
 * `launchError` for a one-time callout; the page removes them from the URL once read.
 */
export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = one(sp.tab);
  const initialTab: DetailTab | null = tab === "review" || tab === "recipients" || tab === "settings" ? tab : null;
  const flash: DetailFlash = {
    launched: one(sp.launched) === "1",
    created: one(sp.created) === "1",
    skipped: num(sp.skipped),
    addError: one(sp.addError),
    launchError: one(sp.launchError),
  };
  return <CampaignDetail id={decodeURIComponent(id)} initialTab={initialTab} flash={flash} />;
}
