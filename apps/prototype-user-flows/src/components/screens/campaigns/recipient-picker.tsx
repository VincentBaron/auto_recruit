"use client";

// Multi-select of Enriched people for a Campaign. Shows why someone cannot be added (Claim by
// another Recruiter, already in a Campaign, Prospect rules), the retention countdown of Candidates
// never Contacted, and never offers a work email for Candidates. With a Detected Role in the Brief of
// a Hiring Contacts Campaign, it starts on that Prospect's Hiring Contacts.

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Briefcase, CircleSlash, Lock, Search, UsersRound } from "lucide-react";
import { RetentionBadge } from "@/components/domain/person-badges";
import { formatDate } from "@/lib/format";
import { AUDIENCE_LABELS, METHOD_LABELS, PROVIDER_LABELS } from "@/lib/labels";
import type { CampaignAudience, ClientState, ContactValue } from "@/lib/types";
import { eligiblePeople, personKey, type EligiblePerson } from "./derive";
import { LanguageChip, ScoreBar, VerificationBadge } from "./shared";
import { Badge, Button, Checkbox, EmptyState, Segmented, TextInput, cx } from "./ui";

export function useEligible(state: ClientState, nicheId: string, audience: CampaignAudience, campaignId?: string): EligiblePerson[] {
  return useMemo(
    () => eligiblePeople(state, { nicheId, audience, recruiterId: state.session.recruiterId, campaignId }),
    [state, nicheId, audience, campaignId],
  );
}

/** Applies "one Hiring Contact per Prospect" within the current selection. */
function blockedInSelection(people: EligiblePerson[], selected: Set<string>): Map<string, string> {
  const byProspect = new Map<string, string>();
  for (const p of people) {
    const key = personKey(p.info);
    if (selected.has(key) && p.info.prospect) byProspect.set(p.info.prospect.id, key);
  }
  const out = new Map<string, string>();
  for (const p of people) {
    const key = personKey(p.info);
    if (p.blocked || selected.has(key) || !p.info.prospect) continue;
    const other = byProspect.get(p.info.prospect.id);
    if (other) {
      const name = people.find((x) => personKey(x.info) === other)?.info.name ?? "someone";
      out.set(key, `${name} is already selected at ${p.info.prospect.name}: one Hiring Contact per Prospect at a time`);
    }
  }
  return out;
}

/** A Hiring Contacts Campaign whose Brief names a Detected Role: the picker starts on that Prospect. */
export interface PickerFocus {
  prospectId: string;
  prospectName: string;
}

/** The Prospect of the Brief's Detected Role, for a Hiring Contacts Campaign; null otherwise. */
export function pickerFocus(state: ClientState, audience: CampaignAudience, detectedRoleId: string | null): PickerFocus | null {
  if (audience !== "hiring_contacts" || !detectedRoleId) return null;
  const role = state.detectedRoles.find((r) => r.id === detectedRoleId);
  const prospect = role ? state.prospects.find((p) => p.id === role.prospectId) : undefined;
  return prospect ? { prospectId: prospect.id, prospectName: prospect.name } : null;
}

function Provenance({ email }: { email: ContactValue }) {
  return (
    <span
      className="block truncate text-[11px] text-zinc-500"
      title={`Provenance: ${PROVIDER_LABELS[email.provenance.provider]}, ${METHOD_LABELS[email.provenance.method]}, ${email.provenance.sourceUrl}, found on ${formatDate(email.provenance.foundOn)}`}
    >
      {PROVIDER_LABELS[email.provenance.provider]} - {METHOD_LABELS[email.provenance.method]} - {formatDate(email.provenance.foundOn)}
    </span>
  );
}

export function RecipientPicker({
  state,
  people,
  audience,
  selected,
  onChange,
  focus = null,
  maxHeightClass = "max-h-[440px]",
}: {
  state: ClientState;
  people: EligiblePerson[];
  audience: CampaignAudience;
  selected: string[];
  onChange: (keys: string[]) => void;
  focus?: PickerFocus | null;
  maxHeightClass?: string;
}) {
  const [query, setQuery] = useState("");
  const atFocus = focus ? people.filter((p) => p.info.prospect?.id === focus.prospectId) : [];
  const [scope, setScope] = useState<"prospect" | "all">(() => (atFocus.length > 0 ? "prospect" : "all"));
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectionBlocks = useMemo(() => blockedInSelection(people, selectedSet), [people, selectedSet]);
  const q = query.trim().toLowerCase();
  const inScope = focus && scope === "prospect" ? atFocus : people;
  const visible = q ? inScope.filter((p) => `${p.info.name} ${p.info.subtitle} ${p.info.location}`.toLowerCase().includes(q)) : inScope;
  const available = people.filter((p) => !p.blocked);
  const claimedByOthers = people.filter((p) => p.claimedBy).length;
  const today = state.clock.today;

  const toggle = (key: string, on: boolean) => {
    if (on) onChange([...selected, key]);
    else onChange(selected.filter((k) => k !== key));
  };

  /** Everyone available among the rows shown, one Hiring Contact per Prospect. */
  const selectAllShown = () => {
    const next = new Set(selected);
    const prospectsTaken = new Set<string>();
    for (const p of people) if (next.has(personKey(p.info)) && p.info.prospect) prospectsTaken.add(p.info.prospect.id);
    for (const p of visible) {
      if (p.blocked) continue;
      const key = personKey(p.info);
      if (next.has(key)) continue;
      if (p.info.prospect) {
        if (prospectsTaken.has(p.info.prospect.id)) continue;
        prospectsTaken.add(p.info.prospect.id);
      }
      next.add(key);
    }
    onChange([...next]);
  };
  const shownAvailable = visible.some((p) => !p.blocked && !selectedSet.has(personKey(p.info)));

  if (people.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300">
        <EmptyState
          icon={<UsersRound />}
          title={`No Enriched ${AUDIENCE_LABELS[audience]} in this Niche yet`}
          action={
            <Link href="/feed" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Enrich people from the Feed <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          Only people holding verified contact details can join a Campaign. You can still create it with an auto-add rule: newly Enriched people join as
          you enrich them.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          {focus ? (
            <Segmented
              label="Who to show"
              size="sm"
              value={scope}
              onChange={setScope}
              options={[
                { value: "prospect", label: `At ${focus.prospectName}`, count: atFocus.length },
                { value: "all", label: "Whole Niche", count: people.length },
              ]}
            />
          ) : null}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, title or location" className="w-full pl-8" aria-label="Search people" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="tabular-nums">
            <span className="font-medium text-zinc-900">{selected.length}</span> selected of {available.length} available
          </span>
          {selected.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>
              Clear
            </Button>
          ) : null}
          <Button size="sm" onClick={selectAllShown} disabled={!shownAvailable}>
            Select all available
          </Button>
        </div>
      </div>
      {focus ? (
        <p className="flex items-start gap-1.5 border-b border-zinc-200 bg-indigo-50/50 px-3 py-2 text-xs leading-5 text-indigo-900">
          <Briefcase className="mt-0.5 size-3.5 shrink-0 text-indigo-500" aria-hidden />
          <span>
            The Detected Role is only mentioned to {focus.prospectName}&apos;s Hiring Contacts; others get a hook from their own Signals.
          </span>
        </p>
      ) : null}
      <div className={cx("overflow-y-auto", maxHeightClass)}>
        {/* Widths on the header cells, so the columns hidden on phones take no room. */}
        <table className="w-full table-fixed text-left text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-zinc-500 shadow-[0_1px_0_0_rgb(228_228_231)]">
            <tr>
              <th className="w-10 px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-2 py-2 font-medium">{audience === "candidates" ? "Candidate" : "Hiring Contact"}</th>
              <th className="hidden w-[120px] px-2 py-2 font-medium sm:table-cell">Signal Strength</th>
              <th className="hidden w-[38%] px-3 py-2 font-medium sm:table-cell">{audience === "candidates" ? "Personal email" : "Work email"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.map((p) => {
              const key = personKey(p.info);
              const checked = selectedSet.has(key);
              const reason = p.blocked ?? (checked ? null : selectionBlocks.get(key) ?? null);
              const disabled = reason !== null && !checked;
              const email = p.info.email;
              return (
                <tr key={key} className={cx(disabled ? "bg-zinc-50/60" : "hover:bg-zinc-50", checked && "bg-indigo-50/50 hover:bg-indigo-50/70")}>
                  <td className="px-3 py-2.5 align-top">
                    <Checkbox checked={checked} disabled={disabled} onChange={(v) => toggle(key, v)} label={`Select ${p.info.name}`} className="mt-0.5" />
                  </td>
                  <td className="min-w-0 px-2 py-2.5 align-top">
                    <div className={cx("flex min-w-0 items-center gap-1.5 font-medium", disabled ? "text-zinc-500" : "text-zinc-900")}>
                      <span className="truncate">{p.info.name}</span>
                      <LanguageChip language={p.info.language} />
                    </div>
                    <div className="truncate text-xs text-zinc-500" title={p.info.subtitle}>
                      {p.info.subtitle}
                    </div>
                    {/* Phones: Signal Strength and email under the name instead of in their own columns. */}
                    <div className="mt-1 space-y-0.5 sm:hidden">
                      <div className="text-xs tabular-nums text-zinc-500">
                        Signal Strength <span className="font-medium text-zinc-800">{Math.round(p.info.signalStrength)}</span> - Fit {p.info.fit}
                      </div>
                      {email ? (
                        <div className="truncate text-xs text-zinc-700" title={email.value}>
                          {email.value}
                        </div>
                      ) : null}
                    </div>
                    {p.info.deleteOn ? (
                      <div className="mt-1.5 flex">
                        <RetentionBadge deleteOn={p.info.deleteOn} today={today} onHold={p.info.retentionHold} />
                      </div>
                    ) : null}
                    {p.claimedBy ? (
                      <Badge tone="amber" className="mt-1.5" icon={<Lock className="size-3" aria-hidden />}>
                        Claimed by {p.claimedBy}
                      </Badge>
                    ) : reason ? (
                      <div className="mt-1 flex items-start gap-1 text-xs leading-5 text-zinc-500">
                        <CircleSlash className="mt-0.5 size-3 shrink-0" aria-hidden />
                        <span className="min-w-0">{reason}</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="hidden px-2 py-2.5 align-top sm:table-cell">
                    <ScoreBar value={p.info.signalStrength} label="Signal Strength" />
                    <div className="mt-1 text-xs tabular-nums text-zinc-500">Fit {p.info.fit}</div>
                  </td>
                  <td className="hidden min-w-0 px-3 py-2.5 align-top sm:table-cell">
                    {email ? (
                      <>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13px] text-zinc-800" title={email.value}>
                            {email.value}
                          </span>
                          <VerificationBadge value={email} />
                        </div>
                        <Provenance email={email} />
                      </>
                    ) : (
                      <span className="text-xs text-zinc-400">No verified email</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-500">
                  {q ? <>Nobody matches &quot;{query}&quot;.</> : "Nobody to show here."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="space-y-1 border-t border-zinc-200 bg-zinc-50/70 px-3 py-2.5 text-xs leading-5 text-zinc-500">
        {audience === "candidates" ? (
          <p>Candidates are only emailed at a personal address, never at their current employer: work emails are not offered.</p>
        ) : (
          <p>One Hiring Contact per Prospect in an active Sequence at a time. A reply from anyone at a Prospect stops all outreach to it.</p>
        )}
        <p>
          Adding someone gives you a Claim: other Recruiters cannot contact them until it lapses, 90 days after the last activity.
          {claimedByOthers > 0 ? ` ${claimedByOthers} ${claimedByOthers === 1 ? "person is" : "people are"} claimed by another Recruiter.` : ""}
        </p>
      </div>
    </div>
  );
}
