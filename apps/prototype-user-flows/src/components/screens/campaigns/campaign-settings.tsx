"use client";

// Settings tab of a Campaign (Brief, Sequence, Sending, Autonomy and auto-add rule), and the
// dialog to add recipients at any time.

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Briefcase, Globe, Save, UserPlus } from "lucide-react";
import { formatDate, formatRelative, formatWeekdays } from "@/lib/format";
import { AUTONOMY_DESCRIPTIONS, AUTONOMY_LABELS, SENDING_LIMITS } from "@/lib/labels";
import { PRICES } from "@/lib/pricing";
import type { Autonomy, Campaign, ClientState } from "@/lib/types";
import { act } from "@/lib/api";
import { dailyCapacity, isUsableMailbox, mailboxById, parsePersonKey } from "./derive";
import { RecipientPicker, pickerFocus, useEligible } from "./recipient-picker";
import { MailboxStatusBadge } from "./shared";
import { Badge, Button, Card, CardHeader, Checkbox, Meta, Modal, PriceHint, TextInput, Toggle, cx, useToast } from "./ui";

/** Anchor of the Sending card: "Choose a Sending Mailbox" scrolls to it. */
export const SENDING_CARD_ID = "campaign-sending";

export function CampaignSettings({ state, campaign, canEdit }: { state: ClientState; campaign: Campaign; canEdit: boolean }) {
  const role = campaign.brief.detectedRoleId ? state.detectedRoles.find((r) => r.id === campaign.brief.detectedRoleId) : undefined;
  const roleProspect = role ? state.prospects.find((p) => p.id === role.prospectId) : undefined;
  let day = 0;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Brief" description="What the Outreach Agent writes from, with each recipient's Signals and your Voice Profile." />
        <dl className="divide-y divide-zinc-100 px-4">
          <Meta label="Angle">
            <p className="leading-6">{campaign.brief.angle}</p>
          </Meta>
          <Meta label="Call to action">{campaign.brief.callToAction}</Meta>
          <Meta label="Detected Role">
            {role ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <Briefcase className="size-3.5 text-zinc-400" aria-hidden />
                {role.title}
                {roleProspect ? (
                  <Link href={`/prospects/${roleProspect.id}`} className="text-indigo-600 hover:text-indigo-500">
                    at {roleProspect.name}
                  </Link>
                ) : null}
                {role.stale ? <Badge tone="amber">Open 30+ days</Badge> : null}
              </span>
            ) : (
              <span className="text-zinc-500">None, the Niche at large</span>
            )}
          </Meta>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Sequence" description="Follow-ups only go out when there is no reply, in the same thread." />
        <ol className="space-y-0 px-4 py-3">
          {campaign.sequence.map((s, i) => {
            if (i > 0) day += s.delayDays;
            return (
              <li key={s.step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">{s.step}</span>
                  {i < campaign.sequence.length - 1 ? <span className="w-px flex-1 bg-zinc-200" aria-hidden /> : null}
                </div>
                <div className="min-w-0 pb-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900">
                    {i === 0 ? "First email" : `Follow-up ${i}`}
                    <Badge tone="neutral">Day {day}</Badge>
                    {i > 0 ? <span className="text-xs font-normal text-zinc-500">{s.delayDays} days after email {i}</span> : null}
                  </div>
                  <div className="mt-0.5 text-sm text-zinc-600">{s.instruction}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <SendingCard state={state} campaign={campaign} canEdit={canEdit} />

      <AutonomyCard state={state} campaign={campaign} canEdit={canEdit} />
    </div>
  );
}

function AutonomyCard({ state, campaign, canEdit }: { state: ClientState; campaign: Campaign; canEdit: boolean }) {
  const toast = useToast();
  const [autonomy, setAutonomy] = useState<Autonomy>(campaign.autonomy);
  const [n, setN] = useState(campaign.reviewFirstN);
  const [autoAdd, setAutoAdd] = useState(campaign.autoAddRule !== null);
  const [min, setMin] = useState(campaign.autoAddRule?.minSignalStrength ?? 60);
  const [saving, setSaving] = useState(false);
  const dirty =
    autonomy !== campaign.autonomy ||
    (autonomy === "review_first_n" && n !== campaign.reviewFirstN) ||
    autoAdd !== (campaign.autoAddRule !== null) ||
    (autoAdd && min !== (campaign.autoAddRule?.minSignalStrength ?? 60));
  const valid = autonomy !== "review_first_n" || (Number.isFinite(n) && n >= 1 && n <= 100);

  const save = async () => {
    setSaving(true);
    const res = await act("updateCampaign", {
      campaignId: campaign.id,
      patch: { autonomy, reviewFirstN: n, autoAddRule: autoAdd ? { minSignalStrength: min } : null },
    });
    setSaving(false);
    if (res.ok) toast({ tone: "success", title: "Campaign updated" });
    else toast({ tone: "danger", title: "Could not update the Campaign", description: res.error });
  };

  return (
    <Card>
      <CardHeader title="Autonomy and recipients" description="Replies always wait for you: agents never send a reply." />
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-2">
          {(["review_all", "review_first_n", "auto"] as Autonomy[]).map((a) => (
            <div key={a} className={cx("rounded-md border", autonomy === a ? "border-indigo-300 bg-indigo-50/40" : "border-zinc-200")}>
              <label className={cx("flex gap-2.5 px-3 py-2.5", canEdit ? "cursor-pointer" : "cursor-default")}>
                <input type="radio" name={`autonomy-${campaign.id}`} checked={autonomy === a} disabled={!canEdit} onChange={() => setAutonomy(a)} className="mt-0.5 size-4 accent-indigo-600" />
                <span className="block min-w-0">
                  <span className="block text-sm font-medium text-zinc-900">{AUTONOMY_LABELS[a]}</span>
                  <span className="block text-xs leading-5 text-zinc-500">{AUTONOMY_DESCRIPTIONS[a].replace("first N", `first ${Number.isFinite(n) ? n : "N"}`)}</span>
                </span>
              </label>
              {a === "review_first_n" && autonomy === a ? (
                <div className="flex items-center gap-2 px-3 pb-2.5 pl-9 text-sm text-zinc-700">
                  <span>Review the first</span>
                  <TextInput type="number" min={1} max={100} value={Number.isFinite(n) ? n : ""} disabled={!canEdit} onChange={(e) => setN(e.target.value === "" ? Number.NaN : Number(e.target.value))} className="w-20 tabular-nums" aria-label="Number of first emails to review" />
                  <span>emails</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex items-start gap-3 rounded-md border border-zinc-200 px-3 py-2.5">
          <Toggle checked={autoAdd} onChange={setAutoAdd} label="Auto-add rule" disabled={!canEdit} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-zinc-900">Auto-add newly Enriched people</div>
            <div className="text-xs leading-5 text-zinc-500">People of this Niche you enrich at or above the Signal Strength threshold join automatically.</div>
            {autoAdd ? (
              <div className="mt-2 flex items-center gap-3">
                <input type="range" min={0} max={100} step={5} value={min} disabled={!canEdit} onChange={(e) => setMin(Number(e.target.value))} className="w-40 accent-indigo-600" aria-label="Minimum Signal Strength" />
                <span className="text-sm font-medium tabular-nums text-zinc-900">{min}</span>
              </div>
            ) : null}
          </div>
        </div>

        <dl className="divide-y divide-zinc-100 rounded-md border border-zinc-200 px-3">
          <Meta label="Created">{formatDate(campaign.createdOn)}</Meta>
          <Meta label="Launched">{campaign.launchedOn ? `${formatDate(campaign.launchedOn)}, ${formatRelative(campaign.launchedOn, state.clock.today)}` : "Not yet"}</Meta>
        </dl>

        {canEdit ? (
          <div className="flex justify-end">
            <Button variant="primary" size="sm" icon={<Save className="size-3.5" aria-hidden />} disabled={!dirty || !valid} loading={saving} onClick={() => void save()}>
              Save changes
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Add recipients                                                      */
/* ------------------------------------------------------------------ */

export function AddRecipientsDialog({ state, campaign, open, onClose }: { state: ClientState; campaign: Campaign; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const people = useEligible(state, campaign.nicheId, campaign.audience, campaign.id);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const emails = selected.length * campaign.sequence.length;

  const close = () => {
    setSelected([]);
    onClose();
  };

  const add = async () => {
    const refs = selected.map(parsePersonKey).filter((r) => r !== null);
    setBusy(true);
    const res = await act("addRecipients", { campaignId: campaign.id, people: refs });
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "danger", title: "Could not add recipients", description: res.error });
      return;
    }
    const { added, skipped } = res.result;
    toast({
      tone: skipped.length > 0 ? "info" : "success",
      title: `${added.length} ${added.length === 1 ? "recipient" : "recipients"} added`,
      description:
        skipped.length > 0
          ? `Skipped: ${skipped
              .slice(0, 3)
              .map((s) => `${s.name} (${s.reason})`)
              .join(", ")}${skipped.length > 3 ? ` and ${skipped.length - 3} more` : ""}.`
          : campaign.autonomy === "auto"
            ? "Their first email is scheduled in the next sending window."
            : "Their first drafts are in the review queue.",
    });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Add recipients"
      description={`Enriched ${campaign.audience === "candidates" ? "Candidates" : "Hiring Contacts"} of the Niche. They join the Sequence from the first email.`}
      footer={
        <>
          <span className="mr-auto text-xs leading-5 text-zinc-500">
            Up to {emails} {emails === 1 ? "email" : "emails"}, {PRICES.emailSent} Credit each when{" "}
            <span className="whitespace-nowrap">
              sent <PriceHint />
            </span>
          </span>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" icon={<UserPlus className="size-3.5" aria-hidden />} disabled={selected.length === 0} loading={busy} onClick={() => void add()}>
            Add {selected.length > 0 ? selected.length : ""} {selected.length === 1 ? "recipient" : "recipients"}
          </Button>
        </>
      }
    >
      <RecipientPicker
        state={state}
        people={people}
        audience={campaign.audience}
        selected={selected}
        onChange={setSelected}
        focus={pickerFocus(state, campaign.audience, campaign.brief.detectedRoleId)}
        maxHeightClass="max-h-[52vh]"
      />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Sending Mailboxes and window                                        */
/* ------------------------------------------------------------------ */

function SendingCard({ state, campaign, canEdit }: { state: ClientState; campaign: Campaign; canEdit: boolean }) {
  const toast = useToast();
  const mailboxes = campaign.mailboxIds.map((id) => mailboxById(state, id)).filter((m) => m !== undefined);
  const capacity = dailyCapacity(mailboxes, SENDING_LIMITS.perDomainPerDay);
  const usableNow = mailboxes.filter(isUsableMailbox);
  const own = state.mailboxes.filter((m) => m.recruiterId === campaign.ownerId);
  // Opens on the chooser when the Campaign has nothing to send from ("Choose a Sending Mailbox").
  const [editing, setEditing] = useState(canEdit && usableNow.length === 0);
  const [selected, setSelected] = useState<string[]>(() => usableNow.map((m) => m.id));
  const [saving, setSaving] = useState(false);
  const unchanged = selected.length === campaign.mailboxIds.length && selected.every((id) => campaign.mailboxIds.includes(id));

  const startEditing = () => {
    setSelected(usableNow.map((m) => m.id));
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await act("updateCampaign", { campaignId: campaign.id, patch: { mailboxIds: selected } });
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "danger", title: "Could not change the Sending Mailboxes", description: res.error });
      return;
    }
    setEditing(false);
    toast({
      tone: "success",
      title: "Sending Mailboxes updated",
      description: campaign.status === "active" ? "Waiting emails go out in the next sending window." : "The Campaign sends from them once it runs.",
    });
  };

  return (
    <Card id={SENDING_CARD_ID} className="scroll-mt-[calc(var(--chrome-h)+1rem)]">
      <CardHeader
        title="Sending"
        description={`At most ${SENDING_LIMITS.perMailboxPerDay} emails per mailbox and ${SENDING_LIMITS.perDomainPerDay} per domain a day, fewer while ramping up.`}
        actions={
          canEdit && !editing ? (
            <Button size="sm" onClick={startEditing}>
              Change mailboxes
            </Button>
          ) : (
            <Link href="/settings/mailboxes" className="inline-flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-500">
              Sending Mailboxes <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          )
        }
      />
      {editing ? (
        <div className="px-4 py-3">
          <div className="text-sm font-medium text-zinc-800">Send from</div>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">Only your own active or ramping Sending Mailboxes. Follow-ups stay on the mailbox that started their thread.</p>
          {own.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">
              You have no Sending Mailbox yet.{" "}
              <Link href="/settings/mailboxes" className="font-medium text-indigo-600 hover:text-indigo-500">
                Connect a mailbox
              </Link>
            </p>
          ) : (
            <div className="mt-2.5 divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200">
              {own.map((m) => {
                const usable = isUsableMailbox(m);
                const checked = usable && selected.includes(m.id);
                return (
                  <label key={m.id} className={cx("flex gap-2.5 px-3 py-2.5", usable ? "cursor-pointer hover:bg-zinc-50" : "cursor-not-allowed bg-zinc-50/70")}>
                    <Checkbox
                      checked={checked}
                      disabled={!usable}
                      label={m.address}
                      className="mt-0.5"
                      onChange={(on) => setSelected((prev) => (on ? [...prev, m.id] : prev.filter((id) => id !== m.id)))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cx("min-w-0 break-all text-sm", usable ? "text-zinc-900" : "text-zinc-500")}>{m.address}</span>
                        <MailboxStatusBadge status={m.status} rampDay={m.rampDay} />
                      </span>
                      {!usable && m.statusReason ? <span className="mt-0.5 block text-xs leading-5 text-amber-800">{m.statusReason}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {own.length > 0 && !own.some(isUsableMailbox) ? (
            <p className="mt-2 text-xs leading-5 text-amber-800">
              None of your Sending Mailboxes can send right now.{" "}
              <Link href="/settings/mailboxes" className="font-medium underline">
                Resume or connect one
              </Link>
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {usableNow.length > 0 || !canEdit ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            ) : null}
            <Button size="sm" variant="primary" icon={<Save className="size-3.5" aria-hidden />} loading={saving} disabled={selected.length === 0 || unchanged} onClick={() => void save()}>
              Save mailboxes
            </Button>
          </div>
        </div>
      ) : mailboxes.length === 0 ? (
        <p className="px-4 py-3 text-sm text-red-700">No Sending Mailbox: nothing can be sent.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {mailboxes.map((m) => (
            <li key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-all text-sm font-medium text-zinc-900">{m.address}</span>
                <MailboxStatusBadge status={m.status} rampDay={m.rampDay} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums text-zinc-500">
                <span>
                  {m.sentToday} / {m.dailyCap} sent today
                </span>
                <span>{m.bounceRate}% bounces</span>
                {m.health.inboxPlacement !== null ? <span>{m.health.inboxPlacement}% inbox placement</span> : null}
              </div>
              {m.statusReason && m.status !== "active" ? (
                <div className={cx("mt-1 text-xs leading-5", m.status === "paused" || m.status === "refused" ? "text-amber-800" : "text-zinc-500")}>{m.statusReason}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <dl className="divide-y divide-zinc-100 border-t border-zinc-200 px-4">
        <Meta label="Window">
          <span className="flex flex-wrap items-center gap-1.5">
            {formatWeekdays(campaign.sendingWindow.days)}, {campaign.sendingWindow.start} to {campaign.sendingWindow.end}
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <Globe className="size-3" aria-hidden /> recipient&apos;s time zone
            </span>
          </span>
        </Meta>
        <Meta label="Capacity">
          <span className="tabular-nums">{capacity}</span> emails a day today
        </Meta>
        <Meta label="Cost">
          {PRICES.emailSent} Credit per email sent{" "}
          <span className="whitespace-nowrap">
            <PriceHint />
          </span>
        </Meta>
      </dl>
    </Card>
  );
}
