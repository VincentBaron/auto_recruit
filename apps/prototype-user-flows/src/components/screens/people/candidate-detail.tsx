"use client";

// /candidates/[id]: profile, work history, Signals, Fit, contact values with Provenance and
// verification, retention countdown or Consent status, Article 14 Notice status, Claim, Campaigns,
// Data Request shortcut. Never linked to any Hiring Contact record (ADR-0003).

import Link from "next/link";
import {
  Ban,
  Briefcase,
  CircleCheck,
  Coins,
  Hourglass,
  Lock,
  Mail,
  Megaphone,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Scale,
  Smartphone,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { isOutOfOfficePaused } from "@/components/screens/campaigns/next-send";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { PriceHint } from "@/components/ui/price-hint";
import { Select } from "@/components/ui/select";
import { StatGrid } from "@/components/ui/stat-tile";
import { useAppState, useBackendError } from "@/lib/api";
import { daysUntil, formatCreditsLabel, formatDate, formatMonthYear, formatRelative, formatTenure } from "@/lib/format";
import {
  CONSENT_LABELS,
  DATA_REQUEST_KIND_LABELS,
  DISMISS_REASON_LABELS,
  RECIPIENT_STATE_LABELS,
  RETENTION,
} from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import { openDataRequestFor } from "@/lib/retention";
import type { Candidate, ClientState, DataRequest, DataRequestKind, RecipientState } from "@/lib/types";
import {
  addToCampaignCheck,
  auditFor,
  campaignName,
  canEnrich,
  candidateActivity,
  currentRecruiterId,
  dataRequestsFor,
  enrichBlocker,
  monthsBetween,
  nextEmailNote,
  recipientsFor,
  recruiterName,
  usableEmail,
} from "./derive";
import { AddToCampaignDialog, DismissDialog, EnrichDialog } from "./dialogs";
import { ToastProvider, useAction, useToast } from "./feedback";
import { ActivityPanel, BreakdownTable, ClaimBadge, ContactValueList, FitPanel, LifecycleBadge, NicheChip, SignalsTimeline } from "./parts";
import { CandidateGoneState, DetailSkeleton, PersonSignedOutState } from "./states";
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Callout,
  Card,
  Dot,
  EmptyState,
  ExtLink,
  MetaList,
  Meter,
  ScoreTile,
  cx,
  type Tone,
} from "./ui";

export function CandidateScreen({ id }: { id: string }) {
  return (
    <ToastProvider>
      <CandidateDetail id={id} />
    </ToastProvider>
  );
}

function CandidateDetail({ id }: { id: string }) {
  const state = useAppState();
  const backendError = useBackendError();
  if (!state) return backendError ? <BackendErrorState error={backendError} /> : <DetailSkeleton />;
  if (!state.workspace) return <PersonSignedOutState kind="candidate" />;
  const candidate = state.candidates.find((c) => c.id === id);
  if (!candidate) return <CandidateGoneState />;
  return <CandidateView state={state} candidate={candidate} />;
}

const RECIPIENT_TONES: Record<RecipientState, Tone> = {
  awaiting_review: "amber",
  scheduled: "sky",
  sent: "indigo",
  replied: "green",
  stopped: "neutral",
};

function CandidateView({ state, candidate: c }: { state: ClientState; candidate: Candidate }) {
  const today = state.clock.today;
  const role = c.forDetectedRoleId ? state.detectedRoles.find((r) => r.id === c.forDetectedRoleId) ?? null : null;
  const roleProspect = role ? state.prospects.find((p) => p.id === role.prospectId) ?? null : null;
  const email = usableEmail(c, "candidate");
  const blocker = enrichBlocker(state, c, "candidate");
  const enrichable = canEnrich(state, c, "candidate");
  const claimedByOther = Boolean(c.claim && c.claim.recruiterId !== currentRecruiterId(state));
  const check = addToCampaignCheck(state, c, "candidate");
  const beforeContact = c.lifecycle === "surfaced" || c.lifecycle === "enriched";
  const first = c.name.split(" ")[0];

  const [enrich, setEnrich] = useState<{ key: number; mode: "enrich" | "mobile" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const { pending, run } = useAction();
  const toast = useToast();

  /** With an email already, the only thing left to find is the mobile number. */
  function openEnrich() {
    setEnrich((prev) => ({ key: (prev?.key ?? 0) + 1, mode: email ? "mobile" : "enrich" }));
  }

  async function restore() {
    const res = await run("undismiss", { items: [{ kind: "candidate", id: c.id }] }, "restore");
    if (res.ok) toast({ tone: "success", title: `${c.name} is back in the Feed` });
    else toast({ tone: "error", title: "Could not restore", lines: [res.error] });
  }

  const enrichLabel = email ? "Find mobile number" : "Enrich";
  const enrichIcon = email ? <Smartphone /> : <Coins />;

  return (
    <PageContainer>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Feed", href: "/feed" }, { label: "Candidates", href: "/feed?tab=candidates" }, { label: c.name }]} />
      </div>

      <PageHeader
        leading={<Avatar name={c.name} size="lg" />}
        title={c.name}
        description={
          <>
            <p className="text-[13px] leading-5 text-zinc-700">{c.headline || `${c.currentTitle} at ${c.currentEmployer}`}</p>
            <MetaList
              className="mt-0.5 text-[13px] leading-5 text-zinc-500"
              items={[
                c.location,
                c.seniority,
                `Emails in ${c.language === "fr" ? "French" : "English"}`,
                <ExtLink key="page" href={c.profileUrl}>
                  Public page
                </ExtLink>,
              ]}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <LifecycleBadge lifecycle={c.lifecycle} />
              <ClaimBadge state={state} claim={c.claim} />
              {c.consent && c.consent !== "delete" && (
                <Badge tone="green" icon={<ShieldCheck />}>
                  {CONSENT_LABELS[c.consent]}
                </Badge>
              )}
              {c.nicheIds.map((nid) => (
                <NicheChip key={nid} state={state} nicheId={nid} />
              ))}
              {role && (
                <Link
                  href={roleProspect ? `/prospects/${roleProspect.id}#role-${role.id}` : "/feed"}
                  className="inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md bg-indigo-50 px-1.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
                >
                  <Briefcase className="size-3 shrink-0" />
                  <span className="truncate">
                    Sourced for {role.title}
                    {roleProspect ? ` at ${roleProspect.name}` : ""}
                  </span>
                </Link>
              )}
            </div>
          </>
        }
        actions={
          claimedByOther && blocker ? (
            <span className="inline-flex max-w-full items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs leading-5 text-amber-900 ring-1 ring-amber-200 sm:max-w-xs">
              <Lock className="mt-1 size-3.5 shrink-0" aria-hidden />
              {blocker}
            </span>
          ) : enrichable || check.allowed || c.lifecycle === "dismissed" || (beforeContact && !c.claim) ? (
            <>
              {enrichable && (
                <Button variant={email ? "secondary" : "primary"} icon={enrichIcon} onClick={openEnrich}>
                  {enrichLabel}
                </Button>
              )}
              {check.allowed && (
                <Button variant={email ? "primary" : "secondary"} icon={<Megaphone />} onClick={() => setAddOpen(true)}>
                  Add to Campaign
                </Button>
              )}
              {c.lifecycle === "dismissed" ? (
                <Button variant="secondary" icon={<Undo2 />} loading={pending === "restore"} onClick={restore}>
                  Restore to the Feed
                </Button>
              ) : beforeContact && !c.claim ? (
                <Button variant="secondary" icon={<Ban />} onClick={() => setDismissOpen(true)}>
                  Dismiss
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />

      <div className="mb-6 space-y-3 empty:hidden">
        <RetentionCallout state={state} candidate={c} />
        {c.lifecycle === "dismissed" && (
          <Callout tone="neutral" icon={<Ban />} title={`Dismissed: ${c.dismissReason ? DISMISS_REASON_LABELS[c.dismissReason] : "no reason given"}`}>
            {c.dismissNote ? `"${c.dismissNote}"` : "Dismissed before any contact. The retention countdown still applies."}
          </Callout>
        )}
      </div>

      {/* Scores */}
      <StatGrid>
        <ScoreTile
          label="Signal Strength"
          value={c.signalStrength}
          link={{ href: "#breakdown", label: "Explain" }}
          bar={<Meter value={c.signalStrength} />}
          sub={`From ${c.signals.length} Signal${c.signals.length === 1 ? "" : "s"}, fading with age`}
        />
        <ScoreTile
          label="Fit"
          value={c.fit.score}
          link={{ href: "#fit", label: "Why" }}
          bar={<Meter value={c.fit.score} threshold={c.fit.threshold} />}
          sub={`${c.fit.aboveThreshold ? "Above" : "Below"} the Fit threshold of ${c.fit.threshold}`}
        />
        <ScoreTile label="In current role" value={formatTenure(c.tenureMonths)} sub={`at ${c.currentEmployer}`} />
        <ScoreTile label="Experience" value={`${c.yearsExperience} yrs`} sub={c.seniority} />
      </StatGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card
            id="contact"
            title="Contact details"
            icon={<Mail />}
            description="Verified values, each with its Provenance: where it came from, when, and how."
            actions={
              enrichable && c.contactValues.length > 0 ? (
                <Button size="sm" icon={enrichIcon} onClick={openEnrich}>
                  {enrichLabel}
                </Button>
              ) : undefined
            }
          >
            {c.contactValues.length === 0 ? (
              <EmptyState
                compact
                icon={<Mail />}
                title="Not Enriched yet"
                action={
                  enrichable ? (
                    <Button size="sm" variant="primary" icon={<Coins />} onClick={openEnrich}>
                      Enrich {first}
                    </Button>
                  ) : undefined
                }
              >
                {blocker ? (
                  <>{blocker}.</>
                ) : (
                  <>
                    A personal email costs {formatCreditsLabel(PRICES.verifiedEmail)}, a mobile number {formatCreditsLabel(PRICES.mobile)} more when you tick it. Charged only
                    when found <PriceHint />
                  </>
                )}
              </EmptyState>
            ) : (
              <ContactValueList values={c.contactValues} />
            )}
            <p className="mt-3 flex gap-1.5 border-t border-zinc-100 pt-3 text-xs leading-5 text-zinc-500">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
              Candidates are never emailed at their current employer&apos;s address, so work emails are not offered. Mobile numbers are found only when you tick them.
            </p>
          </Card>

          <ProfileCard candidate={c} today={today} />

          <Card id="signals" title="Signals" icon={<Sparkles />} description="Dated facts suggesting this Candidate is likely, or unlikely, to move.">
            {c.signals.length === 0 ? (
              <EmptyState compact icon={<Sparkles />} title="No Signals yet" />
            ) : (
              <div className="py-1">
                <SignalsTimeline signals={c.signals} breakdown={c.breakdown} today={today} />
              </div>
            )}
          </Card>

          <Card
            id="breakdown"
            title="Signal Strength breakdown"
            icon={<ScrollText />}
            description={`How ${c.signalStrength} is computed, line by line. Negative Signals such as a recent start lower it.`}
            actions={
              c.nicheIds[0] ? (
                <ButtonLink href={`/niches/${c.nicheIds[0]}`} variant="secondary" size="sm">
                  Signal weights
                </ButtonLink>
              ) : undefined
            }
          >
            <BreakdownTable breakdown={c.breakdown} today={today} />
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card id="fit" title="Fit" icon={<CircleCheck />}>
            <FitPanel fit={c.fit} />
          </Card>
          <ComplianceCard state={state} candidate={c} />
          <CampaignsCard state={state} candidate={c} canAdd={check.allowed} reason={check.reason} onAdd={() => setAddOpen(true)} />
          <DataRequestsCard state={state} candidate={c} />
          <Card title="Activity and audit trail" icon={<ScrollText />}>
            <ActivityPanel activity={candidateActivity(state, c)} audit={auditFor(state, [c.id], [c.name], "hiring_contact")} today={today} />
          </Card>
        </aside>
      </div>

      {enrich && (
        <EnrichDialog key={enrich.key} state={state} open targets={[{ kind: "candidate", id: c.id }]} mode={enrich.mode} onClose={() => setEnrich(null)} />
      )}
      {addOpen && (
        <AddToCampaignDialog state={state} open onClose={() => setAddOpen(false)} person={{ kind: "candidate", id: c.id, name: c.name }} nicheIds={c.nicheIds} />
      )}
      {dismissOpen && <DismissDialog open onClose={() => setDismissOpen(false)} items={[{ kind: "candidate", id: c.id }]} label={c.name} />}
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Retention                                                           */
/* ------------------------------------------------------------------ */

/** An open Data Request is a legal hold: retention deletes nothing until it is answered. */
function holdLabel(hold: DataRequest): string {
  return `On hold: open Data Request due ${formatDate(hold.dueOn)}`;
}

function RetentionCallout({ state, candidate: c }: { state: ClientState; candidate: Candidate }) {
  const today = state.clock.today;
  const hold = openDataRequestFor(state, { kind: "candidate", id: c.id });
  const first = c.name.split(" ")[0];
  const holdAction = (
    <ButtonLink href="/settings/privacy" variant="secondary" size="sm">
      Open Data and privacy
    </ButtonLink>
  );
  // An Opt-out deletes a Candidate at once (ADR-0019): a stored Candidate is only suppressed when their
  // address was added to the Suppression List another way, and their retention still applies.
  if (c.lifecycle === "suppressed") {
    return (
      <Callout tone="red" icon={<ShieldX />} title="On the Suppression List" action={hold ? holdAction : undefined}>
        Never contacted again, by any Workspace.{" "}
        {hold
          ? `${holdLabel(hold)}: nothing is deleted until it is answered.`
          : c.retainUntil
            ? `Kept until ${formatDate(c.retainUntil)}, then deleted; the hash stays on the Suppression List.`
            : "The hash stays on the Suppression List."}
      </Callout>
    );
  }
  if (c.consent === "talent_pool") {
    return (
      <Callout tone="green" icon={<ShieldCheck />} title={`In the Talent Pool until ${formatDate(c.retainUntil)}`}>
        Consented on {formatDate(c.consentRecordedOn)} on the Consent Page. Talent Pool Candidates are kept {RETENTION.talentPoolYears} years from their choice.
      </Callout>
    );
  }
  if (c.consent === "this_opportunity") {
    return (
      <Callout tone="indigo" icon={<ShieldCheck />} title={`Consented to this opportunity only, kept until ${formatDate(c.retainUntil)}`}>
        Recorded on {formatDate(c.consentRecordedOn)} on the Consent Page. Do not propose other roles; the data is deleted after {RETENTION.thisOpportunityMonths} months.
      </Callout>
    );
  }
  if (hold && (c.deleteOn || c.retainUntil)) {
    return (
      <Callout tone="neutral" icon={<Lock />} title={holdLabel(hold)} action={holdAction}>
        {DATA_REQUEST_KIND_LABELS[hold.kind]} request received {formatDate(hold.receivedOn)}. Nothing about {first} is deleted until it is answered; then the{" "}
        {c.deleteOn ? `${RETENTION.surfacedCandidateDays}-day retention rule` : "retention after Contact"} applies again.
      </Callout>
    );
  }
  if (c.deleteOn) {
    const n = daysUntil(c.deleteOn, today);
    const title = n <= 0 ? "Deleted today unless contacted" : `Deleted in ${n} day${n === 1 ? "" : "s"} unless contacted`;
    return (
      <Callout tone={n <= 2 ? "red" : n <= 7 ? "amber" : "neutral"} icon={<Hourglass />} title={title}>
        Surfaced {formatDate(c.surfacedOn)}. Candidates never Contacted are deleted {RETENTION.surfacedCandidateDays} days after being Surfaced, here on{" "}
        {formatDate(c.deleteOn)}. Nothing is kept.
      </Callout>
    );
  }
  if (c.retainUntil) {
    return (
      <Callout tone="neutral" icon={<Hourglass />} title={`Kept until ${formatDate(c.retainUntil)}`}>
        Contacted{c.article14NoticeSentOn ? ` on ${formatDate(c.article14NoticeSentOn)} with the Article 14 Notice` : ""}. Without Consent to the Talent Pool, the data is deleted on this
        date, {RETENTION.contactedNoConsentDays} days after the first email; a reply does not extend it.
      </Callout>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Profile and work history                                            */
/* ------------------------------------------------------------------ */

function ProfileCard({ candidate: c, today }: { candidate: Candidate; today: string }) {
  const history = [...c.workHistory].sort((a, b) => {
    if (a.to === null && b.to !== null) return -1;
    if (b.to === null && a.to !== null) return 1;
    return a.from < b.from ? 1 : a.from > b.from ? -1 : 0;
  });
  return (
    <Card title="Profile and work history" icon={<Briefcase />}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-xs text-zinc-500">Seniority</dt>
          <dd className="mt-0.5 text-zinc-900">{c.seniority}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Experience</dt>
          <dd className="mt-0.5 text-zinc-900 tabular-nums">{c.yearsExperience} years</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Location</dt>
          <dd className="mt-0.5 text-zinc-900">{c.location}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Emails in</dt>
          <dd className="mt-0.5 text-zinc-900">{c.language === "fr" ? "French" : "English"}</dd>
        </div>
      </dl>
      {c.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.skills.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </div>
      )}
      <h3 className="mt-5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Work history</h3>
      {history.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">No work history found on public pages.</p>
      ) : (
        <ol className="mt-2 space-y-0">
          {history.map((w, i) => {
            const end = w.to ?? today;
            return (
              <li key={`${w.employer}-${w.from}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                {i < history.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-200" aria-hidden="true" />}
                <span
                  className={cx(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ring-1",
                    w.to === null ? "bg-indigo-50 text-indigo-700 ring-indigo-100" : "bg-zinc-50 text-zinc-500 ring-zinc-200",
                  )}
                  aria-hidden="true"
                >
                  {w.employer.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-zinc-900">{w.title}</span>
                    {w.to === null && <Badge tone="indigo">Current</Badge>}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {w.employer} <Dot /> {w.employerSector}
                  </p>
                  <p className="text-xs text-zinc-400 tabular-nums">
                    {formatMonthYear(w.from)} - {w.to ? formatMonthYear(w.to) : "now"} <Dot /> {formatTenure(monthsBetween(w.from, end))}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Consent, Article 14 Notice, retention                               */
/* ------------------------------------------------------------------ */

function ComplianceCard({ state, candidate: c }: { state: ClientState; candidate: Candidate }) {
  const today = state.clock.today;
  const token = state.consentTokens
    .filter((t) => t.candidateId === c.id)
    .sort((a, b) => (a.createdOn < b.createdOn ? 1 : a.createdOn > b.createdOn ? -1 : 0))[0];
  const hold = openDataRequestFor(state, { kind: "candidate", id: c.id });
  const suppressed = c.lifecycle === "suppressed";
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "Consent",
      value: suppressed ? (
        <>
          <span className="text-zinc-900">On the Suppression List</span>
          <span className="mt-0.5 block text-xs text-zinc-500">Never contacted again, by any Workspace</span>
        </>
      ) : c.consent && c.consent !== "delete" ? (
        <>
          <Badge tone="green">{CONSENT_LABELS[c.consent]}</Badge>
          <span className="mt-1 block text-xs text-zinc-500">Recorded {formatDate(c.consentRecordedOn)} on the Consent Page</span>
        </>
      ) : (
        <>
          <span className="text-zinc-700">Not given yet</span>
          <span className="mt-0.5 block text-xs text-zinc-500">The Consent Page link goes in your response when they reply.</span>
        </>
      ),
    },
    {
      label: "Retention",
      value:
        hold && (c.deleteOn || (c.retainUntil && (suppressed || !c.consent))) ? (
          <>
            <span className="inline-flex items-center gap-1 text-zinc-900">
              <Lock className="size-3.5 text-zinc-500" aria-hidden />
              {holdLabel(hold)}
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">Nothing is deleted until it is answered</span>
          </>
        ) : suppressed && c.retainUntil ? (
          <>
            <span className="text-zinc-900">Kept until {formatDate(c.retainUntil)}, then deleted</span>
            <span className="mt-0.5 block text-xs text-zinc-500">The hash stays on the Suppression List</span>
          </>
        ) : c.deleteOn ? (
          <>
            <span className="text-zinc-900">Deleted {formatDate(c.deleteOn)}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{formatRelative(c.deleteOn, today)}, unless contacted</span>
          </>
        ) : c.retainUntil ? (
          <>
            <span className="text-zinc-900">Kept until {formatDate(c.retainUntil)}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{formatRelative(c.retainUntil, today)}</span>
          </>
        ) : (
          <span className="text-zinc-500">-</span>
        ),
    },
    {
      label: "Article 14 Notice",
      value: c.article14NoticeSentOn ? (
        <>
          <span className="inline-flex items-center gap-1 text-zinc-900">
            <CircleCheck className="size-3.5 text-emerald-600" /> Sent {formatDate(c.article14NoticeSentOn)}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">In the footer of the first email they received</span>
        </>
      ) : (
        <>
          <span className="text-zinc-700">Not sent yet</span>
          <span className="mt-0.5 block text-xs text-zinc-500">Included in the footer of the first email, at the latest</span>
        </>
      ),
    },
    {
      label: "Consent Page",
      value: token ? (
        <>
          <Link href={`/consent/${token.token}`} className="font-medium text-indigo-600 hover:text-indigo-500">
            Open the Consent Page
          </Link>
          <span className="mt-0.5 block text-xs text-zinc-500">
            Link sent {formatDate(token.createdOn)}
            {token.usedOn ? `, answered ${formatDate(token.usedOn)}` : ", not answered yet"}
          </span>
        </>
      ) : (
        <span className="text-zinc-500">No link sent yet</span>
      ),
    },
  ];
  return (
    <Card title="Consent and Article 14 Notice" icon={<ShieldCheck />}>
      <dl className="-my-1 divide-y divide-zinc-100">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 py-2.5 text-[13px]">
            <dt className="text-zinc-500">{r.label}</dt>
            <dd className="min-w-0">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Claim and Campaigns                                                 */
/* ------------------------------------------------------------------ */

function CampaignsCard({
  state,
  candidate: c,
  canAdd,
  reason,
  onAdd,
}: {
  state: ClientState;
  candidate: Candidate;
  canAdd: boolean;
  reason: string | null;
  onAdd: () => void;
}) {
  const today = state.clock.today;
  const me = currentRecruiterId(state);
  const recipients = recipientsFor(state, "candidate", c.id);
  const mine = c.claim?.recruiterId === me;
  const { pending, run } = useAction();
  const toast = useToast();

  async function release() {
    const res = await run("releaseClaim", { person: { kind: "candidate", id: c.id } }, "release");
    if (res.ok) toast({ tone: "success", title: `Claim on ${c.name} released`, lines: ["Any Recruiter of the Workspace can now add them to a Campaign."] });
    else toast({ tone: "error", title: "Could not release the Claim", lines: [res.error] });
  }

  return (
    <Card title="Claim and Campaigns" icon={<Megaphone />}>
      {c.claim ? (
        <div className={cx("rounded-lg px-3 py-2.5 text-xs leading-5 ring-1 ring-inset", mine ? "bg-indigo-50 text-indigo-900 ring-indigo-200" : "bg-amber-50 text-amber-900 ring-amber-200")}>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Lock className="size-3.5" />
            {mine ? "Claimed by you" : `Claimed by ${recruiterName(state, c.claim.recruiterId)}`}
          </p>
          <p className="mt-0.5">
            Since {formatDate(c.claim.since)} in {campaignName(state, c.claim.campaignId)}. Lapses {formatDate(c.claim.expiresOn)} after {RETENTION.claimInactivityDays} days without
            activity.
            {!mine && " Only they can contact this Candidate until then."}
          </p>
          {mine && c.lifecycle !== "replied" && c.lifecycle !== "consented" && c.lifecycle !== "suppressed" && (
            <Button size="sm" variant="ghost" className="-ml-2 mt-1" loading={pending === "release"} onClick={release}>
              Release Claim
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs leading-5 text-zinc-500">Not claimed. Adding {c.name.split(" ")[0]} to a Campaign takes a Claim, so no other Recruiter can contact them.</p>
      )}

      {recipients.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {recipients.map((r) => {
            const sent = r.messages.filter((m) => m.status === "sent" && m.origin === "campaign");
            const last = sent[sent.length - 1];
            const nextNote = nextEmailNote(state, r);
            return (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/campaigns/${r.campaignId}`} className="truncate text-[13px] font-medium text-zinc-900 hover:text-indigo-600">
                    {campaignName(state, r.campaignId)}
                  </Link>
                  <Badge tone={RECIPIENT_TONES[r.state]}>{RECIPIENT_STATE_LABELS[r.state]}</Badge>
                </div>
                <p className="mt-0.5 break-words text-xs text-zinc-500">
                  {last ? `Email ${last.step} sent ${formatRelative(last.sentOn, today)}` : "No email sent yet"}
                  {r.toAddress ? ` · to ${r.toAddress}` : ""}
                  {r.pausedUntil && isOutOfOfficePaused(r, today) ? ` · paused until ${formatDate(r.pausedUntil)}` : ""}
                  {nextNote ? ` · ${nextNote}` : ""}
                </p>
                {r.stopReason && <p className="text-xs text-zinc-500">{r.stopReason}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {canAdd ? (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <Button size="sm" icon={<Megaphone />} onClick={onAdd}>
            Add to Campaign
          </Button>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            Each email sent costs {formatCreditsLabel(PRICES.emailSent)} <PriceHint />
          </p>
        </div>
      ) : !c.claim && reason ? (
        <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">{reason}</p>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Data Requests                                                       */
/* ------------------------------------------------------------------ */

const DATA_REQUEST_KINDS: DataRequestKind[] = ["access", "export", "delete"];

function DataRequestsCard({ state, candidate: c }: { state: ClientState; candidate: Candidate }) {
  const today = state.clock.today;
  const requests = dataRequestsFor(state, c);
  const [kind, setKind] = useState<DataRequestKind>("access");
  const [logging, setLogging] = useState(false);
  const { pending, run } = useAction();
  const toast = useToast();
  const email = usableEmail(c, "candidate");

  async function log() {
    const res = await run("createDataRequest", { personQuery: c.name, kind, requesterEmail: email?.value }, "dr");
    if (res.ok) {
      setLogging(false);
      toast({
        tone: "success",
        title: `Data Request logged for ${c.name}`,
        lines: [`${DATA_REQUEST_KIND_LABELS[kind]} request, due within ${RETENTION.dataRequestDueDays} days.`],
        link: { label: "Open Data and privacy", href: "/settings/privacy" },
      });
    } else {
      toast({ tone: "error", title: "Could not log the Data Request", lines: [res.error] });
    }
  }

  return (
    <Card
      title="Data Requests"
      icon={<Scale />}
      actions={
        <ButtonLink href="/settings/privacy" variant="secondary" size="sm">
          Data and privacy
        </ButtonLink>
      }
    >
      {requests.length === 0 ? (
        <p className="text-xs leading-5 text-zinc-500">No Data Request from {c.name.split(" ")[0]}. Requests to access, export or delete are due within one month.</p>
      ) : (
        <ul className="-my-1 divide-y divide-zinc-100">
          {requests.map((dr) => {
            const n = daysUntil(dr.dueOn, today);
            return (
              <li key={dr.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-zinc-900">{DATA_REQUEST_KIND_LABELS[dr.kind]} request</span>
                  {dr.status === "completed" ? (
                    <Badge tone="green">Completed</Badge>
                  ) : (
                    <Badge tone={n <= 7 ? "red" : "amber"}>{n < 0 ? `Overdue ${-n} d` : n === 0 ? "Due today" : `Due in ${n} d`}</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Received {formatDate(dr.receivedOn)} · due {formatDate(dr.dueOn)}
                </p>
                {dr.resolution && <p className="mt-0.5 text-xs text-zinc-500">{dr.resolution}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 border-t border-zinc-100 pt-3">
        {logging ? (
          <div className="flex items-center gap-2">
            <Select aria-label="Data Request kind" className="min-w-0 flex-1" value={kind} onChange={(e) => setKind(e.target.value as DataRequestKind)}>
              {DATA_REQUEST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DATA_REQUEST_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <Button variant="primary" loading={pending === "dr"} onClick={log}>
              Log request
            </Button>
            <Button variant="ghost" onClick={() => setLogging(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" icon={<Scale />} onClick={() => setLogging(true)}>
            Log a Data Request
          </Button>
        )}
      </div>
    </Card>
  );
}
