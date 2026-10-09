"use client";

// The full explanation of one Feed item, shared by the three variants (inline row expansion in the
// Table, right-hand pane in the Split, the card in the Triage).

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Briefcase,
  Building,
  CircleSlash,
  ExternalLink,
  FileText,
  Lock,
  Mail,
  Search,
  Sparkles,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  formatCreditsLabel,
  formatDate,
  formatEurosCompact,
  formatMonthYear,
  formatNumber,
  formatRelative,
  formatTenure,
  plural,
} from "@/lib/format";
import { FitMeter } from "@/components/domain/person-badges";
import { PriceHint } from "@/components/ui/price-hint";
import { DISMISS_REASON_LABELS, RETENTION } from "@/lib/labels";
import { PRICES, ROLE_SOURCING_MAX_CANDIDATES, ROLE_SOURCING_MAX_COST } from "@/lib/pricing";
import type { Candidate, DetectedRole, HiringContact, Preview, Prospect } from "@/lib/types";
import { useFeed } from "./context";
import { FitExplainer, SignalStrengthExplainer, SignalTimeline } from "./explain";
import { type FeedRow, claimInfo, enrichBlocker, hasEmail, hasMobile, newestSignalId, onRetentionHold } from "./model";
import { CandidateRetentionBadge, ClaimBadge, ContactValueRow, MetaItems, NicheLabel, PersonLifecycleBadge, ProspectStatusBadge, RetentionLine, RoleChips } from "./parts";
import { candidateAddable, enrichRequestForCandidates, enrichRequestForHiringContact, enrichRequestForProspects, prospectEnrichable } from "./requests";
import { Badge, Button, ButtonLink, NewSignalBadge, SectionTitle, SignalStrengthMeter, cx } from "./ui";

export type DetailLayout = "pane" | "card" | "inline";

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-zinc-800">{children}</dd>
    </div>
  );
}

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("min-w-0", className)}>
      <SectionTitle aside={aside}>{title}</SectionTitle>
      {children}
    </section>
  );
}

/** A Credit-spending button that shows its cost and asks to confirm. */
function CostConfirm({
  label,
  icon,
  costText,
  onConfirm,
}: {
  label: string;
  icon?: ReactNode;
  costText: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button size="xs" onClick={() => setOpen(true)}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
      <span>{costText}</span>
      <PriceHint className="bg-white" />
      <Button
        size="xs"
        tone="primary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await onConfirm();
          setBusy(false);
          setOpen(false);
        }}
      >
        Confirm
      </Button>
      <Button size="xs" tone="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Header and actions                                                  */
/* ------------------------------------------------------------------ */

export function ItemHeader({ row }: { row: FeedRow }) {
  const { model } = useFeed();
  if (row.kind === "preview") {
    const pv = row.preview;
    return (
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-400 tabular-nums">#{row.rank}</span>
            <Badge tone="violet" icon={<Lock className="size-3" aria-hidden />}>
              Preview
            </Badge>
            <NicheLabel niche={model.nicheById.get(pv.nicheId)} />
          </div>
          <h2 className="mt-1 text-base font-semibold text-zinc-900">Anonymised Candidate</h2>
          <p className="mt-0.5 text-sm text-zinc-600">{pv.summary}</p>
        </div>
        <Scores signal={pv.signalStrength} fit={pv.fit} threshold={pv.fitDetail.threshold} />
      </div>
    );
  }
  if (row.kind === "prospect") {
    const p = row.prospect;
    return (
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-400 tabular-nums">#{row.rank}</span>
            {p.hasNewSignal ? <NewSignalBadge /> : null}
            <ProspectStatusBadge status={p.status} />
            {p.nicheIds.map((id) => (
              <NicheLabel key={id} niche={model.nicheById.get(id)} />
            ))}
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold text-zinc-900">
            <Link href={`/prospects/${p.id}`} className="truncate hover:underline">
              {p.name}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {p.domain} · {p.sector} · {formatNumber(p.headcount)} people · {p.location}
          </p>
        </div>
        <Scores signal={p.signalStrength} fit={p.fit.score} threshold={p.fit.threshold} />
      </div>
    );
  }
  const c = row.candidate;
  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-400 tabular-nums">#{row.rank}</span>
          <PersonLifecycleBadge lifecycle={c.lifecycle} />
          <ClaimBadge info={claimInfo(model, c.claim)} />
          <CandidateRetentionBadge candidate={c} model={model} />
          {c.nicheIds.map((id) => (
            <NicheLabel key={id} niche={model.nicheById.get(id)} />
          ))}
        </div>
        <h2 className="mt-1 text-base font-semibold text-zinc-900">
          <Link href={`/candidates/${c.id}`} className="hover:underline">
            {c.name}
          </Link>
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          {c.currentTitle} at {c.currentEmployer} · {c.location}
        </p>
      </div>
      <Scores signal={c.signalStrength} fit={c.fit.score} threshold={c.fit.threshold} />
    </div>
  );
}

function Scores({ signal, fit, threshold }: { signal: number; fit: number; threshold: number }) {
  return (
    <div className="flex w-fit shrink-0 items-center gap-4 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200">
      <div>
        <p className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Signal Strength</p>
        <div className="mt-1">
          <SignalStrengthMeter value={signal} />
        </div>
      </div>
      <div className="h-8 w-px bg-zinc-200" aria-hidden />
      <div>
        <p className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
          Fit <span className="font-normal tracking-normal normal-case">(threshold {threshold})</span>
        </p>
        <div className="mt-1">
          <FitMeter score={fit} threshold={threshold} />
        </div>
      </div>
    </div>
  );
}

/** Primary actions for one item. `compact` hides labels' secondary words. */
export function ItemActions({ row, onDismissed }: { row: FeedRow; onDismissed?: () => void }) {
  const { model, openEnrich, openDismiss, openAddToCampaign, restore } = useFeed();
  if (row.kind === "preview") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href="/credits" tone="primary" size="sm">
          <Sparkles className="size-3.5" aria-hidden />
          Buy Credits to reveal people
        </ButtonLink>
        <span className="text-xs text-zinc-500">Identities are sourced and stored only once you buy Credits.</span>
      </div>
    );
  }
  if (row.kind === "prospect") {
    const p = row.prospect;
    if (p.status === "dismissed") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void restore([{ kind: "prospect", id: p.id }])}>
            <Undo2 className="size-3.5" aria-hidden />
            Restore to the Feed
          </Button>
          <ButtonLink href={`/prospects/${p.id}`} size="sm" tone="ghost">
            Open Prospect
            <ArrowUpRight className="size-3.5" aria-hidden />
          </ButtonLink>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {model.isFreeTrial ? (
          <ButtonLink href="/credits" tone="primary" size="sm">
            <Sparkles className="size-3.5" aria-hidden />
            Buy Credits to reveal Hiring Contacts
          </ButtonLink>
        ) : (
          <Button
            tone="primary"
            size="sm"
            disabled={!prospectEnrichable(model, p.id)}
            title={prospectEnrichable(model, p.id) ? undefined : "No Hiring Contact left to enrich"}
            onClick={() => openEnrich(enrichRequestForProspects(model, [p.id]))}
          >
            <Mail className="size-3.5" aria-hidden />
            Enrich Hiring Contacts
          </Button>
        )}
        <Button size="sm" onClick={() => openDismiss([{ kind: "prospect", id: p.id }], onDismissed)}>
          <CircleSlash className="size-3.5" aria-hidden />
          Dismiss
        </Button>
        <ButtonLink href={`/prospects/${p.id}`} size="sm" tone="ghost">
          Open Prospect
          <ArrowUpRight className="size-3.5" aria-hidden />
        </ButtonLink>
      </div>
    );
  }
  const c = row.candidate;
  if (c.lifecycle === "dismissed") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void restore([{ kind: "candidate", id: c.id }])}>
          <Undo2 className="size-3.5" aria-hidden />
          Restore to the Feed
        </Button>
        <ButtonLink href={`/candidates/${c.id}`} size="sm" tone="ghost">
          Open Candidate
          <ArrowUpRight className="size-3.5" aria-hidden />
        </ButtonLink>
      </div>
    );
  }
  const claim = claimInfo(model, c.claim);
  const blocker = enrichBlocker(model, c, "candidate");
  const fullyEnriched = hasEmail(c, "candidate") && hasMobile(c);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {claim.kind === "other" ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
          <Lock className="size-3.5" aria-hidden />
          Claimed by {claim.recruiterName}: only they can contact this Candidate until the Claim lapses on {formatDate(claim.claim.expiresOn)}.
        </span>
      ) : (
        <>
          {!fullyEnriched ? (
            <Button
              tone={hasEmail(c, "candidate") ? "secondary" : "primary"}
              size="sm"
              disabled={blocker !== null}
              onClick={() => openEnrich(enrichRequestForCandidates(model, [c.id]))}
            >
              <Mail className="size-3.5" aria-hidden />
              {hasEmail(c, "candidate") ? "Find a mobile" : "Enrich"}
            </Button>
          ) : null}
          {candidateAddable(model, c.id) && claim.kind === "none" ? (
            <Button tone="primary" size="sm" onClick={() => openAddToCampaign([{ kind: "candidate", id: c.id }])}>
              <UserPlus className="size-3.5" aria-hidden />
              Add to a Campaign
            </Button>
          ) : null}
          {claim.kind === "none" ? (
            <Button size="sm" onClick={() => openDismiss([{ kind: "candidate", id: c.id }], onDismissed)}>
              <CircleSlash className="size-3.5" aria-hidden />
              Dismiss
            </Button>
          ) : null}
        </>
      )}
      <ButtonLink href={`/candidates/${c.id}`} size="sm" tone="ghost">
        Open Candidate
        <ArrowUpRight className="size-3.5" aria-hidden />
      </ButtonLink>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prospect sections                                                   */
/* ------------------------------------------------------------------ */

function ProspectFacts({ p }: { p: Prospect }) {
  const { model } = useFeed();
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700">{p.description}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Fact label="Website">
          <a href={`https://${p.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
            {p.domain}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </Fact>
        <Fact label="Sector">{[p.sector, ...p.tags].join(", ")}</Fact>
        <Fact label="Headcount">{formatNumber(p.headcount)} people</Fact>
        <Fact label="Location">{p.location}</Fact>
        <Fact label="Latest funding">
          {p.latestFunding ? `${p.latestFunding.round}, ${formatEurosCompact(p.latestFunding.amountEur)}, ${formatDate(p.latestFunding.on)}` : "Not disclosed"}
        </Fact>
        <Fact label="Surfaced">{`${formatDate(p.surfacedOn)} (${formatRelative(p.surfacedOn, model.today)})`}</Fact>
      </dl>
      {p.status === "dismissed" && p.dismissReason ? (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 ring-1 ring-zinc-200">
          Dismissed: {DISMISS_REASON_LABELS[p.dismissReason]}
          {p.dismissNote ? ` · "${p.dismissNote}"` : ""}
        </p>
      ) : (
        <FindMore p={p} />
      )}
    </div>
  );
}

function RoleItem({ role }: { role: DetectedRole }) {
  const { model, run, notify } = useFeed();
  const job = role.sourcing.jobId ? model.state.jobs.find((j) => j.id === role.sourcing.jobId) : undefined;
  const running = role.sourcing.status === "running";
  const sourced = model.isFreeTrial ? role.sourcedPreviewIds.length : role.sourcedCandidateIds.length;
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
            <Briefcase className="size-3.5 shrink-0 text-sky-600" aria-hidden />
            <span className="truncate">{role.title}</span>
            {role.stale ? <Badge tone="warning">Open 30+ days</Badge> : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            <MetaItems
              gap="gap-x-2"
              items={[
                <span key="location">{role.location}</span>,
                <span key="posted">posted {formatRelative(role.postedOn, model.today)}</span>,
                <a key="posting" href={role.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">
                  job posting
                  <ExternalLink className="size-3" aria-hidden />
                </a>,
                ...(sourced > 0
                  ? [
                      <Link key="sourced" href={`/prospects/${role.prospectId}#role-${role.id}`} className="text-zinc-700 hover:underline">
                        {plural(sourced, model.isFreeTrial ? "Candidate Preview" : "Candidate")} sourced
                      </Link>,
                    ]
                  : []),
              ]}
            />
          </p>
        </div>
        {running ? (
          <span className="inline-flex items-center gap-2 text-xs text-zinc-600">
            <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200">
              <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }} />
            </span>
            Sourcing Agent running
          </span>
        ) : (
          <CostConfirm
            label="Source for this role"
            icon={<Search className="size-3" aria-hidden />}
            costText={`Up to ${ROLE_SOURCING_MAX_CANDIDATES} Candidates, up to ${formatCreditsLabel(ROLE_SOURCING_MAX_COST)}`}
            onConfirm={async () => {
              const res = await run("sourceForDetectedRole", { detectedRoleId: role.id });
              if (res) notify({ tone: "info", title: "Sourcing Agent started", description: `Finding Candidates for ${role.title}` });
            }}
          />
        )}
      </div>
    </li>
  );
}

function RolesSection({ p }: { p: Prospect }) {
  const { model } = useFeed();
  const roles = model.rolesByProspect.get(p.id) ?? [];
  return (
    <Section title={`Detected Roles (${roles.length})`}>
      {roles.length === 0 ? (
        <p className="text-sm text-zinc-500">No open role inferred from public evidence yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {roles.map((r) => (
            <RoleItem key={r.id} role={r} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function HiringContactItem({ h }: { h: HiringContact }) {
  const { model, openEnrich, openAddToCampaign } = useFeed();
  const claim = claimInfo(model, h.claim);
  const blocker = enrichBlocker(model, h, "hiring_contact");
  const gotEmail = hasEmail(h, "hiring_contact");
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 tabular-nums">
            {h.rank}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-zinc-900">{h.name}</span>
              <span className="text-xs text-zinc-500">{h.title}</span>
              <PersonLifecycleBadge lifecycle={h.lifecycle} />
              <ClaimBadge info={claim} />
              {h.proposed ? <Badge tone="violet">Proposed by a Referral</Badge> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {!model.isFreeTrial && blocker === null ? (
            <Button size="xs" onClick={() => openEnrich(enrichRequestForHiringContact(model, h.id))}>
              <Mail className="size-3" aria-hidden />
              {gotEmail ? "Find a mobile" : "Enrich"}
            </Button>
          ) : null}
          {gotEmail && claim.kind === "none" ? (
            <Button size="xs" onClick={() => openAddToCampaign([{ kind: "hiring_contact", id: h.id }])}>
              <UserPlus className="size-3" aria-hidden />
              Add to a Campaign
            </Button>
          ) : null}
        </div>
      </div>
      {h.contactValues.length > 0 ? (
        <div className="mt-1 ml-7 divide-y divide-zinc-100">
          {h.contactValues.map((v) => (
            <ContactValueRow key={v.id} value={v} today={model.today} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function HiringContactsSection({ p }: { p: Prospect }) {
  const { model } = useFeed();
  const contacts = (model.contactsByProspect.get(p.id) ?? []).slice(0, 3);
  const previews = model.hcPreviewsByProspect.get(p.id) ?? [];
  if (model.isFreeTrial) {
    return (
      <Section title={`Hiring Contacts (${previews.length})`}>
        {previews.length === 0 ? (
          <p className="text-sm text-zinc-500">No Hiring Contact found yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {previews.map((pv) => (
              <PreviewLine key={pv.id} preview={pv} />
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-zinc-500">Previews are anonymised and never stored. Buy Credits to reveal who they are.</p>
      </Section>
    );
  }
  return (
    <Section title={`Hiring Contacts (${contacts.length})`} aside={<span className="text-[11px] text-zinc-400">Ranked, best first</span>}>
      {contacts.length === 0 ? (
        <p className="text-sm text-zinc-500">No Hiring Contact found at this Prospect yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {contacts.map((h) => (
            <HiringContactItem key={h.id} h={h} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function PreviewLine({ preview }: { preview: Preview }) {
  return (
    <li className="flex items-start gap-2 rounded-md bg-violet-50/60 px-2.5 py-2 text-sm text-zinc-700 ring-1 ring-violet-100">
      <Lock className="mt-0.5 size-3.5 shrink-0 text-violet-500" aria-hidden />
      <span>{preview.summary}</span>
    </li>
  );
}

function FindMore({ p }: { p: Prospect }) {
  const { model, run, notify } = useFeed();
  if (model.isFreeTrial || p.status === "dismissed") return null;
  const count = 10;
  return (
    <CostConfirm
      label={`Find ${count} more like ${p.name}`}
      icon={<Building className="size-3" aria-hidden />}
      costText={`Up to ${formatCreditsLabel(count * PRICES.surfacedProspect)} for ${count} Surfaced Prospects`}
      onConfirm={async () => {
        const res = await run("findMoreLike", { prospectId: p.id, count });
        if (res) notify({ tone: "success", title: `${plural(res.surfacedProspectIds.length, "Prospect")} Surfaced`, description: `${formatCreditsLabel(res.creditsCharged)} charged` });
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Candidate sections                                                  */
/* ------------------------------------------------------------------ */

function CandidateFacts({ c }: { c: Candidate }) {
  const { model } = useFeed();
  const role = c.forDetectedRoleId ? model.roleById.get(c.forDetectedRoleId) : undefined;
  const roleProspect = role ? model.prospectById.get(role.prospectId) : undefined;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        <Fact label="Current role">{c.currentTitle}</Fact>
        <Fact label="Employer">{c.currentEmployer}</Fact>
        <Fact label="Tenure">{formatTenure(c.tenureMonths)}</Fact>
        <Fact label="Experience">{c.yearsExperience} years, {c.seniority}</Fact>
        <Fact label="Location">{c.location}</Fact>
        <Fact label="Surfaced">{`${formatDate(c.surfacedOn)} (${formatRelative(c.surfacedOn, model.today)})`}</Fact>
      </dl>
      {c.skills.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {c.skills.map((s) => (
            <Badge key={s} tone="outline">
              {s}
            </Badge>
          ))}
        </div>
      ) : null}
      {role ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
          <span>Sourced for</span>
          <RoleChips roles={[role]} today={model.today} />
          {roleProspect ? <span>at {roleProspect.name}</span> : null}
        </p>
      ) : null}
      {c.lifecycle === "dismissed" && c.dismissReason ? (
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600 ring-1 ring-zinc-200">
          Dismissed: {DISMISS_REASON_LABELS[c.dismissReason]}
          {c.dismissNote ? ` · "${c.dismissNote}"` : ""}
        </p>
      ) : null}
    </div>
  );
}

function CandidateStatus({ c }: { c: Candidate }) {
  const { model } = useFeed();
  const claim = claimInfo(model, c.claim);
  return (
    <Section title="Retention and notices">
      <ul className="space-y-1.5 text-sm">
        <li>
          {c.deleteOn || c.retainUntil || c.consent || onRetentionHold(model, c) ? (
            <RetentionLine candidate={c} model={model} />
          ) : (
            <p className="text-sm text-zinc-600">Once Contacted without Consent, deleted {RETENTION.contactedNoConsentDays} days after the first email.</p>
          )}
        </li>
        <li className="flex items-start gap-2 text-xs text-zinc-600">
          <FileText className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
          {c.article14NoticeSentOn
            ? `Article 14 Notice sent on ${formatDate(c.article14NoticeSentOn)}, with the first email.`
            : "Article 14 Notice not sent yet: it goes in the footer of the first email."}
        </li>
        {claim.kind !== "none" ? (
          <li className="flex items-start gap-2 text-xs text-zinc-600">
            <Users className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
            {claim.kind === "mine"
              ? `Your Claim${claim.campaignName ? ` through "${claim.campaignName}"` : ""}, lapses on ${formatDate(claim.claim.expiresOn)} without activity.`
              : `Claimed by ${claim.recruiterName} since ${formatDate(claim.claim.since)}, lapses on ${formatDate(claim.claim.expiresOn)} without activity.`}
          </li>
        ) : null}
      </ul>
    </Section>
  );
}

function ContactDetails({ c }: { c: Candidate }) {
  const { model } = useFeed();
  return (
    <Section title="Contact details">
      {c.contactValues.length > 0 ? (
        <div className="divide-y divide-zinc-100">
          {c.contactValues.map((v) => (
            <ContactValueRow key={v.id} value={v} today={model.today} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Not Enriched yet. Enrichment finds a personal email ({formatCreditsLabel(PRICES.verifiedEmail)}) and, only if you tick it, a mobile (
          {formatCreditsLabel(PRICES.mobile)}). <PriceHint />
        </p>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-zinc-400">
        <Lock className="mt-px size-3 shrink-0" aria-hidden />
        Work emails are never offered for Candidates: no email to their current employer&apos;s address.
      </p>
    </Section>
  );
}

function WorkHistory({ c }: { c: Candidate }) {
  return (
    <Section title="Work history">
      <ol className="space-y-2">
        {c.workHistory.map((w) => (
          <li key={`${w.employer}-${w.from}`} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium text-zinc-800">{w.title}</span>
              <span className="block truncate text-xs text-zinc-500">
                {w.employer} · {w.employerSector}
              </span>
            </span>
            <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
              {formatMonthYear(w.from)} - {w.to ? formatMonthYear(w.to) : "now"}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Assembled                                                           */
/* ------------------------------------------------------------------ */

export function ItemDetail({
  row,
  layout,
  showHeader = true,
  showActions = true,
  onDismissed,
}: {
  row: FeedRow;
  layout: DetailLayout;
  showHeader?: boolean;
  showActions?: boolean;
  onDismissed?: () => void;
}) {
  const { model, markSeen } = useFeed();
  const head = (
    <>
      {showHeader ? <ItemHeader row={row} /> : null}
      {showActions ? (
        <div className={cx(showHeader && "mt-3")}>
          <ItemActions row={row} onDismissed={onDismissed} />
        </div>
      ) : null}
    </>
  );

  if (row.kind === "preview") {
    const pv = row.preview;
    // The same line-by-line explanation as a revealed Candidate, from anonymised Signals and Fit
    // criteria: no name, employer or evidence link until the Candidate is revealed.
    return (
      <div className="space-y-5">
        {head}
        <div className={cx("grid gap-5", layout === "pane" ? "" : "xl:grid-cols-12")}>
          <Section title="Why this Signal Strength" className={layout === "pane" ? undefined : "xl:col-span-7"}>
            <SignalStrengthExplainer breakdown={pv.breakdown} signals={[]} today={model.today} />
          </Section>
          <Section title="Why this Fit" className={layout === "pane" ? undefined : "xl:col-span-5"}>
            <FitExplainer fit={pv.fitDetail} />
          </Section>
        </div>
        <div className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-900 ring-1 ring-violet-200">
          <p className="flex items-center gap-2 font-medium">
            <Lock className="size-4" aria-hidden />
            Preview only, never stored
          </p>
          <p className="mt-1 text-violet-800/80">
            In the free trial, Candidates and Hiring Contacts are anonymised summaries generated on the fly. Buy Credits to reveal who they are, with their work
            history and contact details, and switch the agents on.
          </p>
        </div>
      </div>
    );
  }

  if (row.kind === "prospect") {
    const p = row.prospect;
    const newSignal = newestSignalId(p);
    const whyNow = (
      <Section title="Why this Signal Strength">
        <SignalStrengthExplainer breakdown={p.breakdown} signals={p.signals} today={model.today} newSignalId={newSignal} />
      </Section>
    );
    const fit = (
      <Section title="Why this Fit">
        <FitExplainer fit={p.fit} />
      </Section>
    );
    const signals = (
      <Section title={`Signals (${p.signals.length})`}>
        <SignalTimeline signals={p.signals} today={model.today} newSignalId={newSignal} onMarkSeen={() => markSeen(p.id)} />
      </Section>
    );
    if (layout === "inline") {
      return (
        <div className="space-y-4">
          {head}
          <div className="grid gap-5 xl:grid-cols-12">
            <div className="space-y-5 xl:col-span-7">
              <ProspectFacts p={p} />
              {whyNow}
              <RolesSection p={p} />
            </div>
            <div className="space-y-5 xl:col-span-5">
              {fit}
              <HiringContactsSection p={p} />
            </div>
          </div>
        </div>
      );
    }
    if (layout === "card") {
      return (
        <div className="space-y-6">
          {head}
          <ProspectFacts p={p} />
          {whyNow}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0 space-y-6">
              {fit}
              {signals}
            </div>
            <div className="min-w-0 space-y-6">
              <RolesSection p={p} />
              <HiringContactsSection p={p} />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {head}
        <ProspectFacts p={p} />
        {whyNow}
        {fit}
        <RolesSection p={p} />
        <HiringContactsSection p={p} />
        {signals}
      </div>
    );
  }

  const c = row.candidate;
  const whyNow = (
    <Section title="Why this Signal Strength">
      <SignalStrengthExplainer breakdown={c.breakdown} signals={c.signals} today={model.today} />
    </Section>
  );
  const fit = (
    <Section title="Why this Fit">
      <FitExplainer fit={c.fit} />
    </Section>
  );
  const signals = (
    <Section title={`Signals (${c.signals.length})`}>
      <SignalTimeline signals={c.signals} today={model.today} />
    </Section>
  );
  if (layout === "inline") {
    return (
      <div className="space-y-4">
        {head}
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-7">
            <CandidateFacts c={c} />
            {whyNow}
            <WorkHistory c={c} />
          </div>
          <div className="space-y-5 xl:col-span-5">
            {fit}
            <ContactDetails c={c} />
            <CandidateStatus c={c} />
          </div>
        </div>
      </div>
    );
  }
  if (layout === "card") {
    return (
      <div className="space-y-6">
        {head}
        <CandidateFacts c={c} />
        {whyNow}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-6">
            {fit}
            {signals}
          </div>
          <div className="min-w-0 space-y-6">
            <CandidateStatus c={c} />
            <ContactDetails c={c} />
            <WorkHistory c={c} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {head}
      <CandidateFacts c={c} />
      <CandidateStatus c={c} />
      {whyNow}
      {fit}
      <ContactDetails c={c} />
      {signals}
      <WorkHistory c={c} />
    </div>
  );
}

