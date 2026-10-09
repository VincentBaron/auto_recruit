"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Ban,
  CircleCheck,
  Gauge,
  Globe,
  Mailbox,
  Pause,
  Play,
  Plug,
  Plus,
  ShieldAlert,
  Trash,
  TrendingUp,
  WandSparkles,
} from "lucide-react";
import { formatDate, formatNumber, formatPercent, formatRelative, plural } from "@/lib/format";
import { MAILBOX_STATUS_LABELS, SENDING_LIMITS } from "@/lib/labels";
import type { ClientState, MailboxStatus, SendingDomain, SendingMailbox } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { AssistedSetupDialog, ConnectMailboxDialog } from "./mailbox-dialogs";
import { SetupProgress, TERMS_RISK_TEXT, rampProgress } from "./mailbox-parts";
import { recruiterName, useRunner } from "./shared";
import {
  Badge,
  Button,
  Callout,
  Card,
  CheckItem,
  EmailAddress,
  EmptyState,
  Flash,
  Input,
  Meter,
  Modal,
  NoWorkspace,
  PROVIDER_PRODUCT,
  ProviderMark,
  SettingsPage,
  SettingsSkeleton,
  StatGrid,
  StatTile,
  type Tone,
  cx,
  useFlash,
} from "./ui";

const TITLE = "Sending Mailboxes";
const DESCRIPTION = (
  <>
    Campaign emails leave from these Google Workspace and Microsoft 365 mailboxes, in your own tenant and never on a Main Domain. New mailboxes ramp up; caps are{" "}
    {SENDING_LIMITS.perMailboxPerDay} emails per mailbox and {SENDING_LIMITS.perDomainPerDay} per domain per day.
  </>
);

const STATUS_TONE: Record<MailboxStatus, Tone> = {
  warming: "indigo",
  active: "green",
  paused: "amber",
  refused: "red",
};

type Dialog =
  | { kind: "connect" }
  | { kind: "assisted" }
  | { kind: "remove"; mailbox: SendingMailbox }
  | { kind: "resume"; mailbox: SendingMailbox }
  | null;

export function MailboxesScreen() {
  const s = useAppState();
  const loadError = useBackendError();
  const [flash, setFlash] = useFlash();
  const { pending, run } = useRunner(setFlash);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (!s) return <SettingsSkeleton title={TITLE} description={DESCRIPTION} error={loadError} />;
  if (!s.workspace) return <NoWorkspace title={TITLE} description={DESCRIPTION} what="connect Sending Mailboxes" />;

  const usable = s.mailboxes.filter((m) => m.status !== "refused");
  const refused = s.mailboxes.filter((m) => m.status === "refused");
  const sendingNow = usable.filter((m) => m.status === "active" || m.status === "warming");
  const capacity = sendingNow.reduce((a, m) => a + m.dailyCap, 0);
  const sentToday = usable.reduce((a, m) => a + m.sentToday, 0);
  const count = (st: MailboxStatus) => s.mailboxes.filter((m) => m.status === st).length;
  const runningSetups = s.assistedSetups.filter((a) => a.status === "running");

  return (
    <SettingsPage
      title={TITLE}
      description={DESCRIPTION}
      actions={
        <>
          <Button icon={Plug} onClick={() => setDialog({ kind: "connect" })}>
            Connect a mailbox
          </Button>
          <Button variant="primary" icon={WandSparkles} onClick={() => setDialog({ kind: "assisted" })}>
            Assisted setup
          </Button>
        </>
      }
    >
      <Flash flash={flash} onClose={() => setFlash(null)} />

      <StatGrid>
        <StatTile
          label="Sent today"
          value={`${formatNumber(sentToday)} / ${formatNumber(capacity)}`}
          hint={
            <>
              Against today&apos;s caps
              <div className="mt-2">
                <Meter value={sentToday} max={Math.max(1, capacity)} label="Emails sent today against today's caps" />
              </div>
            </>
          }
        />
        <StatTile label="Active" value={count("active")} hint={`Up to ${SENDING_LIMITS.perMailboxPerDay} emails a day each`} />
        <StatTile label="Ramping up" value={count("warming")} hint={`From ${SENDING_LIMITS.rampStartPerDay} a day, about ${SENDING_LIMITS.rampDays} days`} />
        <StatTile
          label="Paused or refused"
          value={count("paused") + count("refused")}
          tone={count("paused") > 0 ? "warning" : "default"}
          hint={count("paused") > 0 ? `${plural(count("paused"), "paused mailbox", "paused mailboxes")}, ${count("refused")} refused` : "Nothing needs attention"}
        />
      </StatGrid>

      {runningSetups.map((setup) => (
        <Card key={setup.id} title={`Assisted setup in progress: ${setup.domain}`} description={`${PROVIDER_PRODUCT[setup.provider]} - ${setup.mailboxAddresses.join(", ")}`}>
          <SetupProgress steps={setup.steps} progress={setup.progress} />
        </Card>
      ))}

      {usable.length === 0 ? (
        <Card>
          <EmptyState
            icon={Mailbox}
            title="No Sending Mailboxes yet"
            description="Campaigns need at least one. Assisted setup registers a lookalike domain in your name and creates mailboxes in your own tenant; or connect a mailbox you already have."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={Plug} onClick={() => setDialog({ kind: "connect" })}>
                  Connect a mailbox
                </Button>
                <Button variant="primary" icon={WandSparkles} onClick={() => setDialog({ kind: "assisted" })}>
                  Assisted setup
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        groupByDomain(s, usable).map(({ domain, info, mailboxes }) => (
          <DomainCard
            key={domain}
            s={s}
            domain={domain}
            info={info}
            mailboxes={mailboxes}
            pending={pending}
            onPause={(m) => void run(`pause:${m.id}`, "pauseMailbox", { mailboxId: m.id }, () => `${m.address} paused. Its scheduled emails wait until you resume it.`)}
            onResume={(m) => setDialog({ kind: "resume", mailbox: m })}
            onRemove={(m) => setDialog({ kind: "remove", mailbox: m })}
          />
        ))
      )}

      {refused.length > 0 ? (
        <Card
          title={
            <span className="flex items-center gap-2">
              Refused
              <Badge tone="red" icon={Ban}>
                {refused.length}
              </Badge>
            </span>
          }
          description="These mailboxes are on a Main Domain. Campaign emails are never sent from a Main Domain."
          bodyClassName="divide-y divide-zinc-100"
        >
          {refused.map((m) => (
            <div key={m.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
              <ProviderMark provider={m.provider} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <EmailAddress address={m.address} className="text-sm font-medium text-zinc-900" />
                  <Badge tone="red" icon={Ban}>
                    {MAILBOX_STATUS_LABELS.refused}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {recruiterName(s, m.recruiterId)} - tried on {formatDate(m.connectedOn)}
                </p>
                {m.statusReason ? <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-700">{m.statusReason}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" icon={WandSparkles} onClick={() => setDialog({ kind: "assisted" })}>
                  Use a lookalike domain
                </Button>
                <Button size="sm" variant="ghost" icon={Trash} loading={pending === `remove:${m.id}`} onClick={() => void run(`remove:${m.id}`, "removeMailbox", { mailboxId: m.id }, () => `${m.address} removed.`)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SendingRules />
        <TermsRisk />
      </div>

      <MainDomains s={s} pending={pending} run={run} />

      <ConnectMailboxDialog
        open={dialog?.kind === "connect"}
        s={s}
        onClose={() => setDialog(null)}
        onAssisted={() => setDialog({ kind: "assisted" })}
      />
      <AssistedSetupDialog open={dialog?.kind === "assisted"} s={s} onClose={() => setDialog(null)} />

      <Modal
        open={dialog?.kind === "remove"}
        onClose={() => setDialog(null)}
        size="sm"
        title="Remove this Sending Mailbox?"
        description={dialog?.kind === "remove" ? <EmailAddress address={dialog.mailbox.address} /> : undefined}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="danger"
              icon={Trash}
              loading={dialog?.kind === "remove" && pending === `remove:${dialog.mailbox.id}`}
              onClick={async () => {
                if (dialog?.kind !== "remove") return;
                const m = dialog.mailbox;
                const r = await run(`remove:${m.id}`, "removeMailbox", { mailboxId: m.id }, () => `${m.address} removed. Campaign emails are no longer sent from it.`);
                if (r) setDialog(null);
              }}
            >
              Remove mailbox
            </Button>
          </>
        }
      >
        {dialog?.kind === "remove" ? (
          <div className="space-y-3 text-sm leading-6 text-zinc-700">
            <p>Campaign emails stop leaving from this mailbox and Auto Recruit gives up its access to it. Replies already received stay in the Inbox.</p>
            <p>
              The mailbox itself stays in your {PROVIDER_PRODUCT[dialog.mailbox.provider]} tenant: {s.workspace?.name ?? "your Workspace"} owns it and can keep using or delete it there.
            </p>
            <CampaignsUsing s={s} mailboxId={dialog.mailbox.id} />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={dialog?.kind === "resume"}
        onClose={() => setDialog(null)}
        size="sm"
        title="Resume this Sending Mailbox?"
        description={dialog?.kind === "resume" ? <EmailAddress address={dialog.mailbox.address} /> : undefined}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Play}
              loading={dialog?.kind === "resume" && pending === `resume:${dialog.mailbox.id}`}
              onClick={async () => {
                if (dialog?.kind !== "resume") return;
                const m = dialog.mailbox;
                const ramp = rampProgress(m);
                const r = await run(`resume:${m.id}`, "resumeMailbox", { mailboxId: m.id }, () =>
                  ramp.complete
                    ? `${m.address} resumed. It sends again from the next sending window.`
                    : `${m.address} resumed on ramp day ${ramp.day} (up to ${ramp.cap} a day). It sends again from the next sending window.`,
                );
                if (r) setDialog(null);
              }}
            >
              Resume sending
            </Button>
          </>
        }
      >
        {dialog?.kind === "resume" ? <ResumeDetails m={dialog.mailbox} /> : null}
      </Modal>
    </SettingsPage>
  );
}

/** What resuming does: the ramp continues from the day it was paused on, or full cap once ramped. */
function ResumeDetails({ m }: { m: SendingMailbox }) {
  const ramp = rampProgress(m);
  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-700">
      {m.statusReason ? <p>{m.statusReason}</p> : null}
      <p>
        {ramp.complete
          ? `Sending resumes at the full cap of ${SENDING_LIMITS.perMailboxPerDay} a day.`
          : `Sending resumes on ramp day ${ramp.day} (up to ${ramp.cap} a day) and continues the ramp.`}{" "}
        It follows the Campaigns&apos; sending windows.
      </p>
      {m.bounceRate > SENDING_LIMITS.bounceRatePausePercent ? (
        <Callout tone="warning" title={`Bounce rate ${formatPercent(m.bounceRate)}, above the ${SENDING_LIMITS.bounceRatePausePercent}% threshold`}>
          Bounced addresses are already marked invalid and the next provider was tried. If bounces continue, the mailbox pauses again automatically to protect the domain.
        </Callout>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Domain groups and mailbox rows                                      */
/* ------------------------------------------------------------------ */

function groupByDomain(s: ClientState, mailboxes: SendingMailbox[]) {
  const domains = new Map<string, SendingMailbox[]>();
  for (const d of s.sendingDomains) domains.set(d.domain, []);
  for (const m of mailboxes) domains.set(m.domain, [...(domains.get(m.domain) ?? []), m]);
  return [...domains.entries()]
    .filter(([, list]) => list.length > 0)
    .map(([domain, list]) => ({
      domain,
      info: s.sendingDomains.find((d) => d.domain === domain) ?? null,
      mailboxes: [...list].sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0)),
    }));
}

function DomainCard({
  s,
  domain,
  info,
  mailboxes,
  pending,
  onPause,
  onResume,
  onRemove,
}: {
  s: ClientState;
  domain: string;
  info: SendingDomain | null;
  mailboxes: SendingMailbox[];
  pending: string | null;
  onPause: (m: SendingMailbox) => void;
  onResume: (m: SendingMailbox) => void;
  onRemove: (m: SendingMailbox) => void;
}) {
  const usage = s.derived.domainUsage.find((d) => d.domain === domain);
  const sent = usage?.sentToday ?? mailboxes.reduce((a, m) => a + m.sentToday, 0);
  const cap = usage?.cap ?? SENDING_LIMITS.perDomainPerDay;
  const dns = info?.dns ?? { spf: mailboxes.every((m) => m.health.spf), dkim: mailboxes.every((m) => m.health.dkim), dmarc: mailboxes.every((m) => m.health.dmarc) };
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Globe className="size-4 text-zinc-400" aria-hidden />
          <span className="[overflow-wrap:anywhere]">{domain}</span>
          {info?.assisted ? <Badge tone="indigo">Lookalike domain</Badge> : <Badge>Connected domain</Badge>}
        </span>
      }
      description={
        info ? (
          <span>
            Registered in {info.registeredFor}&apos;s name on {formatDate(info.registeredOn)} - {PROVIDER_PRODUCT[info.provider]}
          </span>
        ) : (
          <span>Domain managed by your own registrar</span>
        )
      }
      actions={
        <div className="flex w-full flex-col gap-1.5 sm:w-56">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-zinc-500">Domain cap today</span>
            <span className="font-medium tabular-nums text-zinc-800">
              {sent} / {cap}
            </span>
          </div>
          <Meter value={sent} max={cap} tone={sent >= cap ? "amber" : "indigo"} label={`Emails sent today from ${domain} against the ${cap} per domain cap`} />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <CheckItem ok={dns.spf} label="SPF" />
            <CheckItem ok={dns.dkim} label="DKIM" />
            <CheckItem ok={dns.dmarc} label="DMARC" />
          </div>
        </div>
      }
      bodyClassName="divide-y divide-zinc-100"
    >
      {mailboxes.map((m) => (
        <MailboxRow key={m.id} s={s} m={m} pending={pending} onPause={onPause} onResume={onResume} onRemove={onRemove} />
      ))}
    </Card>
  );
}

function MailboxRow({
  s,
  m,
  pending,
  onPause,
  onResume,
  onRemove,
}: {
  s: ClientState;
  m: SendingMailbox;
  pending: string | null;
  onPause: (m: SendingMailbox) => void;
  onResume: (m: SendingMailbox) => void;
  onRemove: (m: SendingMailbox) => void;
}) {
  const today = s.clock.today;
  const bounceHigh = m.bounceRate > SENDING_LIMITS.bounceRatePausePercent;
  const ownerName = recruiterName(s, m.recruiterId);
  const isYou = s.derived.currentRecruiter?.id === m.recruiterId;
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5">
            <ProviderMark provider={m.provider} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <EmailAddress address={m.address} className="text-sm font-medium text-zinc-900" />
              <Badge tone={STATUS_TONE[m.status]} icon={m.status === "paused" ? Pause : m.status === "warming" ? TrendingUp : CircleCheck}>
                {MAILBOX_STATUS_LABELS[m.status]}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {ownerName}
              {isYou ? " (you)" : ""} - {PROVIDER_PRODUCT[m.provider]} - {m.setup === "assisted" ? "assisted setup" : "connected"} {formatRelative(m.connectedOn, today)}
              {m.alreadyWarmed ? " - already warmed" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 pl-7 sm:pl-0">
          {m.status === "paused" ? (
            <Button size="sm" icon={Play} loading={pending === `resume:${m.id}`} onClick={() => onResume(m)}>
              Resume
            </Button>
          ) : (
            <Button size="sm" icon={Pause} loading={pending === `pause:${m.id}`} onClick={() => onPause(m)}>
              Pause
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={Trash} onClick={() => onRemove(m)} aria-label={`Remove ${m.address}`}>
            Remove
          </Button>
        </div>
      </div>

      {m.status === "paused" && m.statusReason ? (
        <Callout tone="warning" className="mt-3" icon={ShieldAlert}>
          {m.statusReason}
        </Callout>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-zinc-500">Ramp</dt>
          <dd className="mt-1">
            <RampMeter m={m} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-zinc-500">Sent today</dt>
          <dd className="mt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className="font-medium tabular-nums text-zinc-900">
                {m.sentToday} / {m.dailyCap}
                {m.status === "paused" ? <span className="font-normal text-zinc-500"> · paused</span> : null}
              </span>
              <span className="text-xs tabular-nums text-zinc-500">{formatNumber(m.sentTotal)} in total</span>
            </div>
            <div className="mt-1.5">
              <Meter value={m.sentToday} max={Math.max(1, m.dailyCap)} tone={m.status === "paused" ? "neutral" : "indigo"} label={`Sent today from ${m.address}`} />
            </div>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-zinc-500">Bounce rate</dt>
          <dd className="mt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className={cx("font-medium tabular-nums", bounceHigh ? "text-red-700" : "text-zinc-900")}>{formatPercent(m.bounceRate)}</span>
              <span className="text-xs text-zinc-500">pauses above {SENDING_LIMITS.bounceRatePausePercent}%</span>
            </div>
            <div className="mt-1.5">
              <Meter
                value={m.bounceRate}
                max={SENDING_LIMITS.bounceRatePausePercent * 2}
                tone={bounceHigh ? "red" : m.bounceRate > SENDING_LIMITS.bounceRatePausePercent * 0.66 ? "amber" : "green"}
                label={`Bounce rate of ${m.address}`}
              />
            </div>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-zinc-500">Inbox placement</dt>
          <dd className="mt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className="font-medium tabular-nums text-zinc-900">{m.health.inboxPlacement === null ? "Measuring" : `${m.health.inboxPlacement}%`}</span>
              <span className="text-xs text-zinc-500">our seed mailboxes</span>
            </div>
            <div className="mt-1.5">
              <Meter value={m.health.inboxPlacement ?? 0} max={100} tone={m.health.inboxPlacement === null ? "neutral" : m.health.inboxPlacement >= 85 ? "green" : "amber"} label={`Inbox placement of ${m.address}`} />
            </div>
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-2 border-t border-dashed border-zinc-100 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <CheckItem ok={m.health.spf} label="SPF" />
          <CheckItem ok={m.health.dkim} label="DKIM" />
          <CheckItem ok={m.health.dmarc} label="DMARC" />
          <CheckItem ok={!m.health.blocklisted} label={m.health.blocklisted ? "On a blocklist" : "Not blocklisted"} />
          <CheckItem ok={m.health.domainAgeDays >= 14} warn label={`Domain ${plural(m.health.domainAgeDays, "day")} old`} />
        </div>
        <CampaignsUsing s={s} mailboxId={m.id} inline />
      </div>
    </div>
  );
}

/** 21 segments, one per ramp day: shows where the mailbox is on its 5-to-30 ramp. */
function RampMeter({ m }: { m: SendingMailbox }) {
  const days = SENDING_LIMITS.rampDays;
  const { complete: done, day, cap } = rampProgress(m);
  const paused = m.status === "paused";
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium tabular-nums text-zinc-900">{done ? "Complete" : `Day ${day} of ${days}`}</span>
        <span className="text-xs tabular-nums text-zinc-500">{done || paused ? `${cap} a day` : `${cap} a day today`}</span>
      </div>
      <div className="mt-1.5 flex gap-px" role="img" aria-label={done ? "Ramp complete" : `Ramp day ${day} of ${days}`}>
        {Array.from({ length: days }, (_, i) => (
          <span
            key={i}
            className={cx(
              "h-1.5 flex-1 first:rounded-l-full last:rounded-r-full",
              done || i < day ? (paused ? "bg-zinc-400" : "bg-indigo-500") : paused ? "bg-zinc-100" : "bg-indigo-100",
            )}
          />
        ))}
      </div>
      {!done ? (
        <p className="mt-1 text-xs text-zinc-500">
          {paused ? "On hold while paused, continues on resume" : `${SENDING_LIMITS.perMailboxPerDay} a day from day ${days}`}
        </p>
      ) : null}
    </div>
  );
}

function CampaignsUsing({ s, mailboxId, inline = false }: { s: ClientState; mailboxId: string; inline?: boolean }) {
  const campaigns = s.campaigns.filter((c) => c.mailboxIds.includes(mailboxId));
  if (campaigns.length === 0) {
    return inline ? <span className="text-xs text-zinc-400">Not used by a Campaign yet</span> : null;
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      Used by
      {campaigns.map((c) => (
        <Link key={c.id} href={`/campaigns/${c.id}`} className="max-w-full truncate rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700 hover:bg-zinc-200">
          {c.name}
        </Link>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Rules, terms risk, Main Domains                                     */
/* ------------------------------------------------------------------ */

function SendingRules() {
  const items = [
    {
      icon: TrendingUp,
      title: "New mailboxes ramp up",
      text: `From ${SENDING_LIMITS.rampStartPerDay} to ${SENDING_LIMITS.perMailboxPerDay} Campaign emails a day over about ${SENDING_LIMITS.rampDays} days. No warmup network: inbox placement is measured with our own seed mailboxes. Already-warmed mailboxes can start at full cap.`,
    },
    {
      icon: Gauge,
      title: "Daily caps",
      text: `${SENDING_LIMITS.perMailboxPerDay} emails per mailbox and ${SENDING_LIMITS.perDomainPerDay} per domain per day, on weekdays, inside each Campaign's sending window in the recipient's time zone.`,
    },
    {
      icon: ShieldAlert,
      title: "Automatic pause",
      text: `A mailbox pauses on its own when its bounce rate goes over ${SENDING_LIMITS.bounceRatePausePercent}%, before the domain's reputation suffers.`,
    },
    {
      icon: Plug,
      title: "Separate consent",
      text: "Signing in never asks for mailbox access. Connecting a Sending Mailbox is its own consent, with its own scopes, revocable at any time.",
    },
  ];
  return (
    <Card title="How sending works">
      <ul className="space-y-3.5">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
              <it.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{it.title}</p>
              <p className="mt-0.5 text-sm leading-6 text-zinc-600">{it.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TermsRisk() {
  return (
    <Card title="Google Workspace and Microsoft 365 terms">
      <Callout tone="warning" title="Risk of tenant suspension">
        {TERMS_RISK_TEXT}
      </Callout>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
        <li className="flex gap-2">
          <CircleCheck className="mt-1 size-4 shrink-0 text-zinc-400" aria-hidden />
          Mailboxes live in your own tenant, which you own and pay for. Auto Recruit never resells mailboxes.
        </li>
        <li className="flex gap-2">
          <CircleCheck className="mt-1 size-4 shrink-0 text-zinc-400" aria-hidden />
          Lookalike domains are registered in your name, so they stay yours if you leave.
        </li>
        <li className="flex gap-2">
          <CircleCheck className="mt-1 size-4 shrink-0 text-zinc-400" aria-hidden />
          No fake engagement between mailboxes: we never run or rent a warmup network.
        </li>
      </ul>
    </Card>
  );
}

function MainDomains({
  s,
  pending,
  run,
}: {
  s: ClientState;
  pending: string | null;
  run: ReturnType<typeof useRunner>["run"];
}) {
  const ws = s.workspace!;
  const [value, setValue] = useState("");
  const clean = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const valid = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean);
  const duplicate = ws.mainDomains.includes(clean);
  const lookalikes = useMemo(() => new Set(s.sendingDomains.map((d) => d.domain)), [s.sendingDomains]);
  return (
    <Card
      title="Main Domains"
      description={`The domains ${ws.name} uses for its website and everyday email. Campaign emails are never sent from them, so a cold-email complaint can never hurt your everyday email.`}
    >
      <ul className="flex flex-wrap gap-2">
        {ws.mainDomains.map((d) => (
          <li key={d} className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 py-1 pl-2.5 pr-1 text-sm">
            <Globe className="size-3.5 text-zinc-400" aria-hidden />
            <span className="font-medium text-zinc-800">{d}</span>
            <Badge tone="red" icon={Ban}>
              No Campaign emails
            </Badge>
            {ws.mainDomains.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${d} from Main Domains`}
                loading={pending === `main-remove:${d}`}
                onClick={() => void run(`main-remove:${d}`, "updateWorkspace", { mainDomains: ws.mainDomains.filter((x) => x !== d) }, () => `${d} is no longer declared as a Main Domain.`)}
              >
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || duplicate) return;
          const r = await run("main-add", "updateWorkspace", { mainDomains: [...ws.mainDomains, clean] }, () => `${clean} declared as a Main Domain. Mailboxes on it will be refused.`);
          if (r) setValue("");
        }}
      >
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="another-domain.fr" aria-label="Declare another Main Domain" />
          {value && !valid ? <p className="mt-1.5 text-xs text-red-600">Enter a domain such as {ws.mainDomains[0] ?? "agency.fr"}</p> : null}
          {duplicate ? <p className="mt-1.5 text-xs text-red-600">Already declared.</p> : null}
          {valid && lookalikes.has(clean) ? <p className="mt-1.5 text-xs text-amber-700">This is one of your sending domains: its mailboxes would be refused.</p> : null}
        </div>
        <Button type="submit" icon={Plus} disabled={!valid || duplicate} loading={pending === "main-add"}>
          Declare a Main Domain
        </Button>
      </form>
    </Card>
  );
}
