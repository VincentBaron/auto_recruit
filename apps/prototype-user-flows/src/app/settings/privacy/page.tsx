import type { Metadata } from "next";
import { PrivacyScreen, type PrivacyTab } from "@/components/screens/settings/privacy-screen";
import type { DataRequestKind } from "@/lib/types";

export const metadata: Metadata = { title: "Data & privacy" };

const TABS: PrivacyTab[] = ["requests", "suppression", "audit"];
const KINDS: DataRequestKind[] = ["access", "export", "delete"];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Deep links:
 * - `?tab=requests|suppression|audit` opens a section.
 * - `?person=<name or email>` (optionally `&kind=access|export|delete`) opens "Record a Data Request"
 *   prefilled, for the Data Request shortcut on a Candidate or Prospect page.
 */
export default async function DataAndPrivacyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = first(params.tab);
  const kind = first(params.kind);
  const person = first(params.person)?.trim();
  return (
    <PrivacyScreen
      key={`${tab ?? ""}|${person ?? ""}|${kind ?? ""}`}
      initialTab={TABS.includes(tab as PrivacyTab) ? (tab as PrivacyTab) : "requests"}
      initialPerson={person ? person : null}
      initialKind={KINDS.includes(kind as DataRequestKind) ? (kind as DataRequestKind) : "access"}
    />
  );
}
