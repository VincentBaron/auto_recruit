"use client";

// /prospects/[id]: company facts, Signals timeline with evidence, Signal Strength breakdown,
// Detected Roles with "Source for this role", up to 3 ranked Hiring Contacts with Enrichment and
// Claim state, outreach, activity and audit trail.

import Link from "next/link";
import {
  Ban,
  Briefcase,
  Building,
  ChevronRight,
  CircleCheck,
  Coins,
  Hourglass,
  Lock,
  LoaderCircle,
  Megaphone,
  Radar,
  Reply,
  ScrollText,
  Smartphone,
  Sparkles,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { FitMeter, RetentionBadge } from "@/components/domain/person-badges";
import { isOutOfOfficePaused } from "@/components/screens/campaigns/next-send";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { PriceHint } from "@/components/ui/price-hint";
import { StatGrid } from "@/components/ui/stat-tile";
import { useAppState, useBackendError } from "@/lib/api";
import { formatCreditsLabel, formatDate, formatEurosCompact, formatNumber, formatRelative } from "@/lib/format";
import { DISMISS_REASON_LABELS, RECIPIENT_STATE_LABELS, REPLY_CATEGORY_LABELS } from "@/lib/labels";
import { PRICES, ROLE_SOURCING_MAX_CANDIDATES, ROLE_SOURCING_MAX_COST } from "@/lib/pricing";
import { openDataRequestFor } from "@/lib/retention";
import type { Candidate, ClientState, DetectedRole, HiringContact, Preview, Prospect, RecipientState } from "@/lib/types";
import {
  addToCampaignCheck,
  auditFor,
  campaignName,
  canEnrich,
  currentRecruiterId,
  enrichBlocker,
  nextEmailNote,
  prospectActivity,
  recruiterName,
  usableEmail,
} from "./derive";
import { AddToCampaignDialog, DismissDialog, EnrichDialog, type EnrichTarget } from "./dialogs";
import { ToastProvider, useAction, useToast } from "./feedback";
import {
  ActivityPanel,
  BreakdownTable,
  ClaimBadge,
  ContactValueList,
  FitPanel,
  LifecycleBadge,
  NewSignalBadge,
  NicheChip,
  ProspectStatusBadge,
  SignalsTimeline,
} from "./parts";
import { DetailSkeleton, NotFoundState, PersonSignedOutState } from "./states";
import {
  ANCHOR_OFFSET,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  ExtLink,
  Fact,
  MetaList,
  Meter,
  ScoreTile,
  cx,
  displayUrl,
  type Tone,
} from "./ui";

export function ProspectScreen({ id }: { id: string }) {
  return (
    <ToastProvider>
      <ProspectDetail id={id} />
    </ToastProvider>
  );
}

function ProspectDetail({ id }: { id: string }) {
  const state = useAppState();
  const backendError = useBackendError();
  if (!state) return backendError ? <BackendErrorState error={backendError} /> : <DetailSkeleton />;
  if (!state.workspace) return <PersonSignedOutState kind="prospect" />;
  const prospect = state.prospects.find((p) => p.id === id);
  if (!prospect) {
    return (
      <NotFoundState title="This Prospect is not in your Feed" backHref="/feed" backLabel="Back to the Feed">
        It may belong to another scenario, or the link is out of date. Prospects stay in the Feed once Surfaced, even when Dismissed.
      </NotFoundState>
    );
  }
  return <ProspectView state={state} prospect={prospect} />;
}

const RECIPIENT_TONES: Record<RecipientState, Tone> = {
  awaiting_review: "amber",
  scheduled: "sky",
  sent: "indigo",
  replied: "green",
  stopped: "neutral",
};

function ProspectView({ state, prospect }: { state: ClientState; prospect: Prospect }) {
  const today = state.clock.today;
  const isFreeTrial = state.derived.isFreeTrial;
  const roles = state.detectedRoles
    .filter((r) => r.prospectId === prospect.id)
    .sort((a, b) => (a.postedOn === b.postedOn ? 0 : a.postedOn < b.postedOn ? 1 : -1));
  const contacts = state.hiringContacts.filter((h) => h.prospectId === prospect.id);
  const previews = state.previews.filter((p) => p.kind === "hiring_contact" && p.prospectId === prospect.id);
  const newestSignal = [...prospect.signals].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const newSignalId = prospect.hasNewSignal ? newestSignal?.id ?? null : null;
  const enrichedCount = contacts.filter((h) => usableEmail(h, "hiring_contact")).length;
  const claimedCount = contacts.filter((h) => h.claim).length;
  const staleRoles = roles.filter((r) => r.stale).length;

  const [dismissOpen, setDismissOpen] = useState(false);
  const { pending, run } = useAction();
  const toast = useToast();

  // The content appears after the first fetch, so honour links such as /prospects/[id]#role-[roleId] here.
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (target) document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, []);

  async function markSeen() {
    const res = await run("markSignalsSeen", { prospectIds: [prospect.id] }, "seen");
    if (!res.ok) toast({ tone: "error", title: "Could not mark the Signals as seen", lines: [res.error] });
  }

  async function restore() {
    const res = await run("undismiss", { items: [{ kind: "prospect", id: prospect.id }] }, "restore");
    if (res.ok) toast({ tone: "success", title: `${prospect.name} is back in the Feed` });
    else toast({ tone: "error", title: "Could not restore", lines: [res.error] });
  }

  return (
    <PageContainer>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Feed", href: "/feed" }, { label: "Prospects", href: "/feed?tab=prospects" }, { label: prospect.name }]} />
      </div>

      <PageHeader
        leading={<Avatar name={prospect.name} shape="square" size="lg" />}
        title={prospect.name}
        description={
          <>
            <MetaList
              className="text-[13px] leading-5 text-zinc-500"
              items={[
                <ExtLink key="domain" href={`https://${prospect.domain}`}>
                  {prospect.domain}
                </ExtLink>,
                prospect.sector,
                prospect.location,
                <span key="headcount" className="tabular-nums">
                  {formatNumber(prospect.headcount)} people
                </span>,
                prospect.latestFunding ? `${prospect.latestFunding.round}, ${formatEurosCompact(prospect.latestFunding.amountEur)}` : null,
              ]}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ProspectStatusBadge status={prospect.status} closedUntil={prospect.closedUntil} />
              {prospect.hasNewSignal && <NewSignalBadge />}
              {prospect.nicheIds.map((nid) => (
                <NicheChip key={nid} state={state} nicheId={nid} />
              ))}
            </div>
          </>
        }
        actions={
          prospect.hasNewSignal || prospect.status === "dismissed" || prospect.status === "surfaced" ? (
            <>
              {prospect.hasNewSignal && (
                <Button variant="secondary" icon={<Sparkles />} loading={pending === "seen"} onClick={markSeen}>
                  Mark Signals as seen
                </Button>
              )}
              {prospect.status === "dismissed" ? (
                <Button variant="secondary" icon={<Undo2 />} loading={pending === "restore"} onClick={restore}>
                  Restore to the Feed
                </Button>
              ) : prospect.status === "surfaced" ? (
                <Button variant="secondary" icon={<Ban />} onClick={() => setDismissOpen(true)}>
                  Dismiss
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />

      {/* Status callouts */}
      <div className="mb-6 space-y-3 empty:hidden">
        {prospect.status === "dismissed" && (
          <Callout tone="neutral" icon={<Ban />} title={`Dismissed: ${prospect.dismissReason ? DISMISS_REASON_LABELS[prospect.dismissReason] : "no reason given"}`}>
            {prospect.dismissNote ? `"${prospect.dismissNote}"` : "Dismissed before any contact. It no longer appears in the Feed."}
          </Callout>
        )}
        {prospect.status === "closed" && (
          <Callout tone="amber" icon={<Hourglass />} title={`Closed until ${formatDate(prospect.closedUntil)}`}>
            A Hiring Contact replied Not Interested, so nobody at {prospect.name} is contacted for 6 months. The Prospect stays visible for context.
          </Callout>
        )}
        {prospect.status === "replied" && (
          <Callout
            tone="green"
            icon={<Reply />}
            title={`Someone at ${prospect.name} replied`}
            action={
              <ButtonLink href="/inbox" variant="secondary" size="sm">
                Open the Inbox
              </ButtonLink>
            }
          >
            A reply from anyone at a Prospect stops all outreach to that Prospect. The agents never answer for you: send the drafted response yourself.
          </Callout>
        )}
      </div>

      {/* Scores */}
      <StatGrid>
        <ScoreTile
          label="Signal Strength"
          value={prospect.signalStrength}
          link={{ href: "#breakdown", label: "Explain" }}
          bar={<Meter value={prospect.signalStrength} />}
          sub={`From ${prospect.signals.length} Signal${prospect.signals.length === 1 ? "" : "s"}, fading with age`}
        />
        <ScoreTile
          label="Fit"
          value={prospect.fit.score}
          link={{ href: "#fit", label: "Why" }}
          bar={<Meter value={prospect.fit.score} threshold={prospect.fit.threshold} />}
          sub={`${prospect.fit.aboveThreshold ? "Above" : "Below"} the Fit threshold of ${prospect.fit.threshold}`}
        />
        <ScoreTile
          label="Detected Roles"
          value={roles.length}
          link={roles.length > 0 ? { href: "#roles", label: "View" } : undefined}
          sub={roles.length === 0 ? "No open role found yet" : staleRoles > 0 ? `${staleRoles} open 30+ days` : `Latest posted ${formatRelative(roles[0].postedOn, today)}`}
        />
        <ScoreTile
          label="Hiring Contacts"
          value={isFreeTrial ? previews.length : contacts.filter((h) => !h.proposed).length}
          link={{ href: "#contacts", label: "View" }}
          sub={isFreeTrial ? "Previews only in the free trial" : `${enrichedCount} Enriched · ${claimedCount} Claimed`}
        />
      </StatGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <HiringContactsCard state={state} prospect={prospect} contacts={contacts} previews={previews} />
          <DetectedRolesCard state={state} prospect={prospect} roles={roles} />
          <Card
            id="signals"
            title="Signals"
            icon={<Sparkles />}
            description="Dated, observable facts behind the timing. Each one links to its evidence."
          >
            {prospect.signals.length === 0 ? (
              <EmptyState compact icon={<Sparkles />} title="No Signals yet">
                The Prospection Agent adds Signals as it finds new evidence on its scheduled runs.
              </EmptyState>
            ) : (
              <div className="py-1">
                <SignalsTimeline signals={prospect.signals} breakdown={prospect.breakdown} today={today} newSignalId={newSignalId} />
              </div>
            )}
          </Card>
          <Card
            id="breakdown"
            title="Signal Strength breakdown"
            icon={<ScrollText />}
            description={`How ${prospect.signalStrength} is computed, line by line. The Feed ranks by Signal Strength among items above the Fit threshold.`}
            actions={
              prospect.nicheIds[0] ? (
                <ButtonLink href={`/niches/${prospect.nicheIds[0]}`} variant="secondary" size="sm">
                  Signal weights
                </ButtonLink>
              ) : undefined
            }
          >
            <BreakdownTable breakdown={prospect.breakdown} today={today} />
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card title="Company facts" icon={<Building />}>
            {prospect.description && <p className="text-[13px] leading-5 text-zinc-700">{prospect.description}</p>}
            <dl className="mt-1 divide-y divide-zinc-100">
              <Fact label="Website">
                <ExtLink href={`https://${prospect.domain}`}>{prospect.domain}</ExtLink>
              </Fact>
              <Fact label="Sector">{prospect.sector}</Fact>
              <Fact label="Headcount">
                <span className="tabular-nums">{formatNumber(prospect.headcount)} people</span>
              </Fact>
              <Fact label="Location">{prospect.location}</Fact>
              <Fact label="Founded">
                <span className="tabular-nums">{prospect.founded}</span>
              </Fact>
              <Fact label="Latest funding">
                {prospect.latestFunding ? (
                  <span>
                    {prospect.latestFunding.round}, {formatEurosCompact(prospect.latestFunding.amountEur)}
                    <span className="block text-xs text-zinc-500">{formatDate(prospect.latestFunding.on)}</span>
                  </span>
                ) : (
                  <span className="text-zinc-500">None announced</span>
                )}
              </Fact>
              <Fact label="Surfaced">
                {formatDate(prospect.surfacedOn)}
                <span className="block text-xs text-zinc-500">{formatRelative(prospect.surfacedOn, today)}</span>
              </Fact>
            </dl>
            {prospect.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
                {prospect.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            )}
          </Card>

          <Card id="fit" title="Fit" icon={<CircleCheck />}>
            <FitPanel fit={prospect.fit} />
          </Card>

          <OutreachCard state={state} prospect={prospect} contacts={contacts} />

          <Card title="Activity and audit trail" icon={<ScrollText />}>
            <ActivityPanel
              activity={prospectActivity(state, prospect)}
              audit={auditFor(
                state,
                [prospect.id, ...contacts.map((h) => h.id), ...roles.map((r) => r.id)],
                [prospect.name, prospect.domain, ...contacts.map((h) => h.name)],
                "candidate",
              )}
              today={today}
            />
          </Card>
        </aside>
      </div>

      <DismissDialog
        key={dismissOpen ? "dismiss-open" : "dismiss-closed"}
        open={dismissOpen}
        onClose={() => setDismissOpen(false)}
        items={[{ kind: "prospect", id: prospect.id }]}
        label={prospect.name}
      />
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Hiring Contacts                                                     */
/* ------------------------------------------------------------------ */

function HiringContactsCard({
  state,
  prospect,
  contacts,
  previews,
}: {
  state: ClientState;
  prospect: Prospect;
  contacts: HiringContact[];
  previews: Preview[];
}) {
  const isFreeTrial = state.derived.isFreeTrial;
  const ranked = contacts.filter((h) => !h.proposed).sort((a, b) => a.rank - b.rank);
  const proposed = contacts.filter((h) => h.proposed);
  const [selected, setSelected] = useState<string[]>([]);
  const [enrich, setEnrich] = useState<{ key: number; targets: EnrichTarget[]; mode: "enrich" | "mobile" } | null>(null);
  const [addFor, setAddFor] = useState<HiringContact | null>(null);

  const selectable = ranked.filter((h) => canEnrich(state, h, "hiring_contact"));
  const selectedLive = selected.filter((id) => selectable.some((h) => h.id === id));

  /** One person who already has a work email: "Find mobile number" asks for the mobile only. */
  function openEnrich(people: HiringContact[]) {
    const mode = people.length === 1 && usableEmail(people[0], "hiring_contact") ? "mobile" : "enrich";
    setEnrich((prev) => ({ key: (prev?.key ?? 0) + 1, targets: people.map((h) => ({ kind: "hiring_contact", id: h.id })), mode }));
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (isFreeTrial) {
    return (
      <Card
        id="contacts"
        title="Hiring Contacts"
        icon={<Users />}
        description="Up to 3 people per Prospect, ranked by who is best placed to talk about hiring."
        flush
      >
        {previews.length === 0 ? (
          <EmptyState icon={<Users />} title="No Hiring Contact Previews yet">
            The Prospection Agent looks for up to 3 Hiring Contacts at each Prospect.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {previews.slice(0, 3).map((pv) => (
              <li key={pv.id} className="flex items-start gap-3 px-4 py-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200">
                  <Lock className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-900">{pv.summary}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Preview: who they are and how to reach them is not stored in the free trial.</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-zinc-600">Enrichment and Campaigns start once the Workspace has Credits.</p>
          <ButtonLink href="/credits" variant="primary" size="sm" icon={<Coins />}>
            Buy Credits to reveal people and switch agents on
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card
      id="contacts"
      title="Hiring Contacts"
      icon={<Users />}
      description="Up to 3 people per Prospect, ranked by who is best placed to talk about hiring. Tick the people to enrich."
      flush
      actions={
        selectable.length > 0 ? (
          <Button
            variant="primary"
            size="sm"
            icon={<Coins />}
            disabled={selectedLive.length === 0}
            onClick={() => openEnrich(ranked.filter((h) => selectedLive.includes(h.id)))}
          >
            {selectedLive.length === 0 ? "Enrich selected" : `Enrich ${selectedLive.length} selected`}
          </Button>
        ) : undefined
      }
    >
      {ranked.length === 0 && proposed.length === 0 ? (
        <EmptyState icon={<Users />} title="No Hiring Contacts found yet">
          The Prospection Agent looks for up to 3 Hiring Contacts at each Prospect on its next run.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {ranked.map((h) => (
            <HiringContactRow
              key={h.id}
              state={state}
              prospect={prospect}
              contact={h}
              selected={selectedLive.includes(h.id)}
              onToggle={() => toggle(h.id)}
              onEnrich={() => openEnrich([h])}
              onAdd={() => setAddFor(h)}
            />
          ))}
          {proposed.map((h) => (
            <ProposedContactRow key={h.id} state={state} contact={h} />
          ))}
        </ul>
      )}

      {enrich && (
        <EnrichDialog
          key={enrich.key}
          state={state}
          open
          targets={enrich.targets}
          mode={enrich.mode}
          onClose={() => {
            setEnrich(null);
            setSelected([]);
          }}
        />
      )}
      {addFor && (
        <AddToCampaignDialog
          state={state}
          open
          onClose={() => setAddFor(null)}
          person={{ kind: "hiring_contact", id: addFor.id, name: addFor.name }}
          nicheIds={prospect.nicheIds}
        />
      )}
    </Card>
  );
}

function HiringContactRow({
  state,
  prospect,
  contact: h,
  selected,
  onToggle,
  onEnrich,
  onAdd,
}: {
  state: ClientState;
  prospect: Prospect;
  contact: HiringContact;
  selected: boolean;
  onToggle: () => void;
  onEnrich: () => void;
  onAdd: () => void;
}) {
  const me = currentRecruiterId(state);
  const blocker = enrichBlocker(state, h, "hiring_contact");
  const enrichable = canEnrich(state, h, "hiring_contact");
  const email = usableEmail(h, "hiring_contact");
  const check = addToCampaignCheck(state, h, "hiring_contact", prospect);
  const mine = h.claim?.recruiterId === me;
  const { pending, run } = useAction();
  const toast = useToast();
  const claimedByOther = Boolean(h.claim && !mine);
  // Why nothing can be done here: the Enrichment blocker first (it covers contacting too), then the
  // Campaign rule. Someone else's Claim is explained in the Claim line itself.
  const reason = claimedByOther ? null : blocker ?? (!check.allowed && !mine && email ? check.reason : null);

  async function release() {
    const res = await run("releaseClaim", { person: { kind: "hiring_contact", id: h.id } }, "release");
    if (res.ok) toast({ tone: "success", title: `Claim on ${h.name} released`, lines: ["Any Recruiter of the Workspace can now add them to a Campaign."] });
    else toast({ tone: "error", title: "Could not release the Claim", lines: [res.error] });
  }

  return (
    <li className={cx("flex items-start gap-3 px-4 py-3.5", selected && "bg-indigo-50/40")}>
      {enrichable ? (
        <input
          type="checkbox"
          aria-label={`Select ${h.name} for Enrichment`}
          className="mt-2.5 size-3.5 shrink-0 cursor-pointer rounded accent-indigo-600"
          checked={selected}
          onChange={onToggle}
        />
      ) : (
        <span className="mt-2.5 size-3.5 shrink-0" aria-hidden="true" />
      )}
      <div className="relative shrink-0">
        <Avatar name={h.name} />
        <span className="absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-zinc-900 text-[9px] font-semibold text-white ring-2 ring-white tabular-nums">
          {h.rank}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold text-zinc-900">{h.name}</span>
          <LifecycleBadge lifecycle={h.lifecycle} />
          <ClaimBadge state={state} claim={h.claim} />
          {h.origin === "referral" && <Badge tone="violet">From a Referral</Badge>}
        </div>
        <MetaList
          spacing="sm"
          className="mt-0.5 text-xs text-zinc-500"
          items={[
            h.title,
            h.location,
            `Rank ${h.rank} to contact`,
            <ExtLink key="page" href={h.profileUrl}>
              Public page
            </ExtLink>,
          ]}
        />

        {h.contactValues.length > 0 && (
          <div className="mt-2.5 rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-2.5">
            <ContactValueList values={h.contactValues} />
          </div>
        )}

        {h.claim && (
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            <Lock className={cx("mr-1 inline size-3 align-[-1px]", claimedByOther ? "text-amber-600" : "text-zinc-400")} aria-hidden />
            {claimedByOther ? (
              <>
                <span className="font-medium text-amber-800">{blocker ?? `Claimed by ${recruiterName(state, h.claim.recruiterId)}`}.</span> Claim taken{" "}
                {formatDate(h.claim.since)} in{" "}
              </>
            ) : (
              <>Claimed by you since {formatDate(h.claim.since)} in </>
            )}
            <Link href={`/campaigns/${h.claim.campaignId}`} className="font-medium text-zinc-700 hover:text-indigo-600">
              {campaignName(state, h.claim.campaignId)}
            </Link>
            , lapses {formatDate(h.claim.expiresOn)} after 90 days without activity.
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2 empty:hidden">
          {enrichable && (
            <Button size="sm" icon={email ? <Smartphone /> : <Coins />} onClick={onEnrich}>
              {email ? "Find mobile number" : "Enrich"}
            </Button>
          )}
          {check.allowed && (
            <Button size="sm" icon={<Megaphone />} onClick={onAdd}>
              Add to Campaign
            </Button>
          )}
          {mine && h.claim && (
            <>
              <ButtonLink href={`/campaigns/${h.claim.campaignId}`} size="sm" variant="ghost">
                Open Campaign
              </ButtonLink>
              {h.lifecycle !== "replied" && h.lifecycle !== "suppressed" && (
                <Button size="sm" variant="ghost" loading={pending === "release"} onClick={release}>
                  Release Claim
                </Button>
              )}
            </>
          )}
          {reason && <span className="text-xs leading-5 text-zinc-500">{reason}</span>}
        </div>
      </div>
    </li>
  );
}

function ProposedContactRow({ state, contact: h }: { state: ClientState; contact: HiringContact }) {
  const { pending, run } = useAction();
  const toast = useToast();
  const reply = h.referredByReplyId ? state.replies.find((r) => r.id === h.referredByReplyId) : null;
  const ws = state.workspace;
  const price = PRICES.hiringContactFound;
  // Same rule as the backend: the balance covers it, or a paid Workspace's auto top-up does.
  const canAfford = Boolean(ws && (ws.credits >= price || (ws.plan === "paid" && ws.autoTopUp.enabled)));

  async function accept() {
    if (!h.referredByReplyId) return;
    const res = await run("acceptReferral", { replyId: h.referredByReplyId }, "accept");
    if (res.ok) {
      toast({
        tone: "success",
        title: `${h.name} accepted as a Hiring Contact - ${formatCreditsLabel(price)} charged`,
        lines: ["Enrich them to add them to a Campaign."],
      });
    } else toast({ tone: "error", title: "Could not accept the Referral", lines: [res.error] });
  }

  return (
    <li className="flex items-start gap-3 bg-violet-50/40 px-4 py-3.5">
      <span className="mt-2.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 ring-1 ring-violet-200">
        <UserPlus className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold text-zinc-900">{h.name}</span>
          <Badge tone="violet">Proposed</Badge>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {h.title}
          {reply ? ` · referred by ${reply.personLabel} in a reply on ${formatDate(reply.receivedOn)}` : " · proposed by a Referral reply"}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={<UserPlus />}
            disabled={!h.referredByReplyId || !canAfford}
            loading={pending === "accept"}
            onClick={accept}
          >
            Accept · {formatCreditsLabel(price)}
          </Button>
          <ButtonLink href="/inbox" size="sm" variant="ghost">
            See the reply
          </ButtonLink>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-zinc-500">
          <span>Accepting adds them as a Hiring Contact for {formatCreditsLabel(price)}</span>
          <PriceHint />
          {!canAfford && (
            <span className="font-medium text-rose-700">
              Not enough Credits.{" "}
              <Link href="/credits" className="underline">
                Buy Credits
              </Link>
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Detected Roles                                                      */
/* ------------------------------------------------------------------ */

function DetectedRolesCard({ state, prospect, roles }: { state: ClientState; prospect: Prospect; roles: DetectedRole[] }) {
  return (
    <Card
      id="roles"
      title="Detected Roles"
      icon={<Briefcase />}
      description="Open roles inferred from public evidence. Source Candidates for one to pitch a shortlist."
      flush
    >
      {roles.length === 0 ? (
        <EmptyState icon={<Briefcase />} title="No Detected Role yet">
          The Prospection Agent adds a Detected Role when it finds a matching posting on {prospect.name}&apos;s careers page or in public postings.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {roles.map((r) => (
            <DetectedRoleRow key={r.id} state={state} role={r} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function DetectedRoleRow({ state, role }: { state: ClientState; role: DetectedRole }) {
  const today = state.clock.today;
  const isFreeTrial = state.derived.isFreeTrial;
  const [confirming, setConfirming] = useState(false);
  const { pending, run } = useAction();
  const toast = useToast();
  const running = role.sourcing.status === "running";
  const job = role.sourcing.jobId ? state.jobs.find((j) => j.id === role.sourcing.jobId) : undefined;
  const sourced = role.sourcedCandidateIds
    .map((id) => state.candidates.find((c) => c.id === id))
    .filter((c): c is Candidate => Boolean(c));
  const sourcedPreviews = state.previews.filter((p) => role.sourcedPreviewIds.includes(p.id));
  const credits = state.workspace?.credits ?? 0;
  const autoTopUp = Boolean(state.workspace?.autoTopUp.enabled);
  const outOfCredits = !isFreeTrial && !autoTopUp && credits < PRICES.surfacedCandidate;
  const total = sourced.length + sourcedPreviews.length;

  async function confirm() {
    const res = await run("sourceForDetectedRole", { detectedRoleId: role.id }, "source");
    setConfirming(false);
    if (res.ok) {
      toast({
        tone: "info",
        title: `Sourcing Agent started for ${role.title}`,
        lines: [isFreeTrial ? "Candidates appear here as Previews in a few seconds." : "Candidates appear here in a few seconds. Credits are charged per Surfaced Candidate."],
      });
    } else {
      toast({ tone: "error", title: "Could not start sourcing", lines: [res.error] });
    }
  }

  return (
    <li id={`role-${role.id}`} className={cx(ANCHOR_OFFSET, "px-4 py-3.5 transition-colors target:bg-indigo-50/50")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-zinc-900">{role.title}</span>
            {role.stale && (
              <Badge tone="amber" icon={<Hourglass />} title="Open more than 30 days or reposted: they struggle to hire">
                Open 30+ days
              </Badge>
            )}
          </div>
          <MetaList
            spacing="sm"
            className="mt-0.5 text-xs text-zinc-500"
            items={[role.location, `Posted ${formatDate(role.postedOn)} (${formatRelative(role.postedOn, today)})`]}
          />
          <p className="flex min-w-0 items-center gap-1 text-xs text-zinc-500">
            <span className="shrink-0">Evidence:</span>
            <ExtLink href={role.sourceUrl} className="max-w-[320px]">
              {displayUrl(role.sourceUrl)}
            </ExtLink>
          </p>
        </div>
        {!confirming && (
          <Button size="sm" variant={total === 0 ? "primary" : "secondary"} icon={<Radar />} disabled={running} onClick={() => setConfirming(true)}>
            {running ? "Sourcing..." : total === 0 ? "Source for this role" : "Source again"}
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2.5">
          <p className="text-[13px] font-medium text-indigo-950">Source Candidates for {role.title}?</p>
          <p className="mt-0.5 text-xs leading-5 text-indigo-900/80">
            {isFreeTrial ? (
              <>The Sourcing Agent shows up to {ROLE_SOURCING_MAX_CANDIDATES} Candidates as Previews. Free in the trial: 0 Credits.</>
            ) : (
              <>
                The Sourcing Agent looks for up to {ROLE_SOURCING_MAX_CANDIDATES} Candidates above the Fit threshold. Up to {formatCreditsLabel(ROLE_SOURCING_MAX_COST)},{" "}
                {formatCreditsLabel(PRICES.surfacedCandidate)} per Surfaced Candidate <PriceHint />. Balance: {formatCreditsLabel(credits)}.
              </>
            )}
          </p>
          {outOfCredits && (
            <p className="mt-1.5 text-xs font-medium text-rose-700">
              Not enough Credits.{" "}
              <Link href="/credits" className="underline">
                Buy Credits
              </Link>
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" icon={<Radar />} disabled={outOfCredits} loading={pending === "source"} onClick={confirm}>
              {isFreeTrial ? "Source Previews, 0 Credits" : `Source for up to ${formatCreditsLabel(ROLE_SOURCING_MAX_COST)}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {running && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800">
              <LoaderCircle className="size-3.5 animate-spin text-indigo-600" />
              Sourcing Agent running
            </span>
            <span className="text-zinc-500 tabular-nums">{Math.round((job?.progress ?? 0) * 100)}%</span>
          </div>
          <div className="mt-2">
            <Meter value={(job?.progress ?? 0) * 100} />
          </div>
          {job && (
            <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {job.steps.map((s) => (
                <li
                  key={s.key}
                  className={cx(
                    "inline-flex items-center gap-1",
                    s.status === "done" ? "text-zinc-700" : s.status === "running" ? "font-medium text-indigo-700" : "text-zinc-400",
                  )}
                >
                  {s.status === "done" ? (
                    <CircleCheck className="size-3.5 text-emerald-600" />
                  ) : s.status === "running" ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <span className="inline-block size-3.5 rounded-full border border-zinc-300" />
                  )}
                  {s.label}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {total > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Sourced Candidates · {total}
            {role.sourcing.lastSourcedOn && <span className="normal-case tracking-normal"> · last run {formatRelative(role.sourcing.lastSourcedOn, today)}</span>}
          </p>
          <ul className="mt-1.5 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
            {sourced.map((c) => (
              <li key={c.id}>
                <Link href={`/candidates/${c.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50">
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 truncate text-[13px] font-medium text-zinc-900">{c.name}</span>
                      <LifecycleBadge lifecycle={c.lifecycle} />
                      {c.lifecycle === "surfaced" || c.lifecycle === "enriched" || c.lifecycle === "dismissed" ? (
                        <RetentionBadge
                          deleteOn={c.deleteOn}
                          today={today}
                          onHold={openDataRequestFor(state, { kind: "candidate", id: c.id }) !== null}
                        />
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {c.currentTitle} at {c.currentEmployer} · {c.location}
                    </p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-5 sm:flex">
                    <div className="text-right">
                      <div className="text-sm text-zinc-900 tabular-nums">{c.signalStrength}</div>
                      <div className="whitespace-nowrap text-[11px] text-zinc-400">Signal Strength</div>
                    </div>
                    <div className="text-right">
                      <FitMeter score={c.fit.score} threshold={c.fit.threshold} />
                      <div className="whitespace-nowrap text-[11px] text-zinc-400">Fit</div>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-zinc-300" />
                </Link>
              </li>
            ))}
            {sourcedPreviews.map((pv) => (
              <li key={pv.id} className="flex items-center gap-3 px-3 py-2">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200">
                  <Lock className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-zinc-900">{pv.summary}</p>
                  <p className="truncate text-xs text-zinc-500">
                    Preview · Signal Strength {pv.signalStrength} · Fit {pv.fit}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {sourcedPreviews.length > 0 && isFreeTrial && (
            <Link href="/credits" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500">
              <Coins className="size-3.5" /> Buy Credits to reveal people and switch agents on
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Outreach                                                            */
/* ------------------------------------------------------------------ */

function OutreachCard({ state, prospect, contacts }: { state: ClientState; prospect: Prospect; contacts: HiringContact[] }) {
  const today = state.clock.today;
  const ids = new Set(contacts.map((h) => h.id));
  const recipients = state.recipients.filter((r) => r.personKind === "hiring_contact" && (r.prospectId === prospect.id || ids.has(r.personId)));
  const recipientIds = new Set(recipients.map((r) => r.id));
  const replies = state.replies.filter((r) => recipientIds.has(r.recipientId) || (r.personKind === "hiring_contact" && r.prospectId === prospect.id));

  return (
    <Card title="Outreach" icon={<Megaphone />} description="Campaign emails to Hiring Contacts here. A reply from anyone stops outreach to the whole Prospect.">
      {recipients.length === 0 ? (
        <p className="py-3 text-center text-xs text-zinc-500">Nobody at {prospect.name} is in a Campaign yet.</p>
      ) : (
        <ul className="-my-1 divide-y divide-zinc-100">
          {recipients.map((r) => {
            const sent = r.messages.filter((m) => m.status === "sent" && m.origin === "campaign");
            const last = sent[sent.length - 1];
            const nextNote = nextEmailNote(state, r);
            return (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-zinc-900">{r.personLabel}</span>
                  <Badge tone={RECIPIENT_TONES[r.state]}>{RECIPIENT_STATE_LABELS[r.state]}</Badge>
                </div>
                <Link href={`/campaigns/${r.campaignId}`} className="mt-0.5 block truncate text-xs text-zinc-500 hover:text-indigo-600">
                  {campaignName(state, r.campaignId)}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {last ? `Email ${last.step} sent ${formatRelative(last.sentOn, today)}` : "No email sent yet"}
                  {r.state === "stopped" && r.stopReason ? ` · ${r.stopReason}` : ""}
                  {r.pausedUntil && isOutOfOfficePaused(r, today) ? ` · paused until ${formatDate(r.pausedUntil)}` : ""}
                  {nextNote ? ` · ${nextNote}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {replies.length > 0 && (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Replies</p>
          <ul className="mt-1.5 space-y-2">
            {replies.map((rep) => (
              <li key={rep.id}>
                <Link href="/inbox" className="group block rounded-lg px-2 py-1.5 -mx-2 hover:bg-zinc-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-zinc-800 group-hover:text-indigo-600">{rep.personLabel}</span>
                    <Badge tone={rep.category === "interested" ? "green" : rep.category === "opt_out" || rep.category === "bounce" ? "red" : "neutral"}>
                      {REPLY_CATEGORY_LABELS[rep.category]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatDate(rep.receivedOn)} · {rep.handled ? "Handled" : "Waiting for you"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
