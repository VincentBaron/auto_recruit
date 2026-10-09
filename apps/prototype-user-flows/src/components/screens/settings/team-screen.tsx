"use client";

import Link from "next/link";
import { useState } from "react";
import { Crown, Hourglass, Lock, Mail, Repeat, Target, UserMinus, UserPlus, Users } from "lucide-react";
import { daysUntil, formatDate, formatRelative, formatWeekdays, plural } from "@/lib/format";
import { NICHE_STATUS_LABELS, RETENTION } from "@/lib/labels";
import type { Claim, ClientState, NicheStatus, PersonKind, Recruiter, RecruiterRole } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { PERSON_KIND_LABELS, isEmail, personHref, recruiterName, useRunner } from "./shared";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  EmailAddress,
  EmptyState,
  Field,
  Flash,
  Input,
  Modal,
  NoWorkspace,
  OptionCard,
  Select,
  SettingsPage,
  SettingsSkeleton,
  StatGrid,
  StatTile,
  type Tone,
  cx,
  useFlash,
} from "./ui";

const TITLE = "Team";
const DESCRIPTION = "The Recruiters of your Workspace, their roles and the Niches they own. An Owner also manages members, Credits and API Keys.";

const ROLE_LABELS: Record<RecruiterRole, string> = { owner: "Owner", recruiter: "Recruiter" };
const NICHE_TONE: Record<NicheStatus, Tone> = { draft: "neutral", testing: "sky", active: "green", paused: "amber" };

type Runner = ReturnType<typeof useRunner>["run"];

const CLAIMS_PAGE = 8;

interface ClaimRow {
  kind: PersonKind;
  id: string;
  name: string;
  claim: Claim;
}

function claimsOf(s: ClientState): ClaimRow[] {
  const rows: ClaimRow[] = [];
  for (const c of s.candidates) if (c.claim) rows.push({ kind: "candidate", id: c.id, name: c.name, claim: c.claim });
  for (const h of s.hiringContacts) if (h.claim) rows.push({ kind: "hiring_contact", id: h.id, name: h.name, claim: h.claim });
  return rows.sort((a, b) => (a.claim.expiresOn < b.claim.expiresOn ? -1 : a.claim.expiresOn > b.claim.expiresOn ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function TeamScreen() {
  const s = useAppState();
  const loadError = useBackendError();
  const [flash, setFlash] = useFlash();
  const { pending, run } = useRunner(setFlash);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Recruiter | null>(null);

  if (!s) return <SettingsSkeleton title={TITLE} description={DESCRIPTION} error={loadError} />;
  if (!s.workspace) return <NoWorkspace title={TITLE} description={DESCRIPTION} what="invite Recruiters and share Niches" />;

  const me = s.derived.currentRecruiter;
  const isOwner = me?.role === "owner";
  const owners = s.recruiters.filter((r) => r.role === "owner" && r.status === "active");
  const claims = claimsOf(s);
  const invited = s.recruiters.filter((r) => r.status === "invited").length;

  return (
    <SettingsPage
      title={TITLE}
      description={DESCRIPTION}
      actions={
        <Button variant="primary" icon={UserPlus} disabled={!isOwner} title={isOwner ? undefined : "Only an Owner invites Recruiters"} onClick={() => setInviting(true)}>
          Invite a Recruiter
        </Button>
      }
    >
      <Flash flash={flash} onClose={() => setFlash(null)} />

      {!isOwner && me ? (
        <Callout tone="info" icon={Lock}>
          You are a Recruiter in {s.workspace.name}. Only an Owner invites members, changes roles and moves Niches between Recruiters.
        </Callout>
      ) : null}

      <StatGrid>
        <StatTile label="Members" value={s.recruiters.length} hint={invited > 0 ? `${plural(invited, "invitation")} pending` : "All active"} />
        <StatTile label="Owners" value={owners.length} hint="Members, Credits, API Keys" />
        <StatTile label="Niches" value={s.niches.length} hint="Each owned by one Recruiter" />
        <StatTile label="Active Claims" value={claims.length} hint={`Lapse after ${RETENTION.claimInactivityDays} days inactive`} />
      </StatGrid>

      <Card title="Members" description="Everyone signs in with Google or Microsoft, identity only. Each Recruiter connects their own Sending Mailboxes." bodyClassName="divide-y divide-zinc-100">
        {s.recruiters.map((r) => (
          <MemberRow
            key={r.id}
            s={s}
            r={r}
            isMe={r.id === me?.id}
            canManage={isOwner}
            lastOwner={r.role === "owner" && owners.length <= 1}
            pending={pending}
            run={run}
            onRemove={() => setRemoving(r)}
          />
        ))}
      </Card>

      <NicheOwnership s={s} canManage={isOwner} pending={pending} run={run} />

      <ClaimsCard s={s} claims={claims} meId={me?.id ?? null} isOwner={isOwner} pending={pending} run={run} />

      <ActAs s={s} pending={pending} run={run} />

      <InviteDialog open={inviting} s={s} busy={pending === "invite"} run={run} onClose={() => setInviting(false)} />

      <RemoveDialog s={s} recruiter={removing} busy={removing !== null && pending === `remove:${removing.id}`} run={run} onClose={() => setRemoving(null)} />
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

function MemberRow({
  s,
  r,
  isMe,
  canManage,
  lastOwner,
  pending,
  run,
  onRemove,
}: {
  s: ClientState;
  r: Recruiter;
  isMe: boolean;
  canManage: boolean;
  lastOwner: boolean;
  pending: string | null;
  run: Runner;
  onRemove: () => void;
}) {
  const niches = s.niches.filter((n) => n.ownerId === r.id).length;
  const mailboxes = s.mailboxes.filter((m) => m.recruiterId === r.id && m.status !== "refused").length;
  const claims = s.candidates.filter((c) => c.claim?.recruiterId === r.id).length + s.hiringContacts.filter((h) => h.claim?.recruiterId === r.id).length;
  const keys = s.apiKeys.filter((k) => k.recruiterId === r.id && k.revokedOn === null).length;
  const facts = [plural(niches, "Niche"), plural(mailboxes, "Sending Mailbox", "Sending Mailboxes"), plural(claims, "Claim"), plural(keys, "API Key")];
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={r.name} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">{r.name}</span>
            {isMe ? <Badge tone="indigo">You</Badge> : null}
            {r.status === "invited" ? (
              <Badge tone="amber" icon={Mail}>
                Invited {r.invitedOn ? formatRelative(r.invitedOn, s.clock.today) : ""}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-zinc-500">
            {r.email}
            {r.title ? ` - ${r.title}` : ""}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {facts.join(" - ")}
            {r.joinedOn ? ` - joined ${formatDate(r.joinedOn)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
        <div className="w-32">
          {canManage && !isMe ? (
            <Select
              aria-label={`Role of ${r.name}`}
              value={r.role}
              disabled={pending === `role:${r.id}` || lastOwner}
              onChange={(e) => {
                const role = e.target.value as RecruiterRole;
                void run(`role:${r.id}`, "updateRecruiterRole", { recruiterId: r.id, role }, () => `${r.name} is now ${role === "owner" ? "an Owner" : "a Recruiter"}.`);
              }}
            >
              <option value="recruiter">Recruiter</option>
              <option value="owner">Owner</option>
            </Select>
          ) : (
            <Badge tone={r.role === "owner" ? "indigo" : "neutral"} icon={r.role === "owner" ? Crown : undefined}>
              {ROLE_LABELS[r.role]}
            </Badge>
          )}
        </div>
        {canManage && !isMe ? (
          <Button size="sm" variant="ghost" icon={UserMinus} onClick={onRemove} aria-label={`Remove ${r.name}`}>
            Remove
          </Button>
        ) : (
          <span className="hidden w-[84px] sm:block" aria-hidden />
        )}
      </div>
    </div>
  );
}

function InviteDialog({ open, s, busy, run, onClose }: { open: boolean; s: ClientState; busy: boolean; run: Runner; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RecruiterRole>("recruiter");
  const [touched, setTouched] = useState(false);
  const exists = s.recruiters.some((r) => r.email.toLowerCase() === email.trim().toLowerCase());
  const valid = name.trim().length > 1 && isEmail(email) && !exists;
  const close = () => {
    setName("");
    setEmail("");
    setRole("recruiter");
    setTouched(false);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite a Recruiter"
      description={`They join ${s.workspace?.name ?? "the Workspace"} and sign in with Google or Microsoft at work, identity only.`}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            icon={UserPlus}
            disabled={!valid}
            loading={busy}
            onClick={async () => {
              setTouched(true);
              if (!valid) return;
              const r = await run("invite", "inviteRecruiter", { name: name.trim(), email: email.trim().toLowerCase(), role }, () => `Invitation sent to ${name.trim()}.`);
              if (r) close();
            }}
          >
            Send invitation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jade Rousseau" autoComplete="off" />}</Field>
          <Field
            label="Work email"
            error={exists ? "Already a member." : touched && !isEmail(email) ? "Enter a work email address." : null}
            hint={s.workspace?.mainDomains[0] ? `Usually on ${s.workspace.mainDomains[0]}` : undefined}
          >
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={`jade@${s.workspace?.mainDomains[0] ?? "agency.fr"}`}
                autoComplete="off"
              />
            )}
          </Field>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-700">Role</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <OptionCard
              selected={role === "recruiter"}
              onSelect={() => setRole("recruiter")}
              icon={Users}
              title="Recruiter"
              description="Prospects, sources and runs outreach in their own Niches, with their own Sending Mailboxes and Voice Profile."
            />
            <OptionCard selected={role === "owner"} onSelect={() => setRole("owner")} icon={Crown} title="Owner" description="Everything a Recruiter does, plus members, Credits and API Keys." />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RemoveDialog({ s, recruiter, busy, run, onClose }: { s: ClientState; recruiter: Recruiter | null; busy: boolean; run: Runner; onClose: () => void }) {
  const ownedNiches = recruiter ? s.niches.filter((n) => n.ownerId === recruiter.id) : [];
  const blocked = ownedNiches.length > 0;
  return (
    <Modal
      open={recruiter !== null}
      onClose={onClose}
      size="sm"
      title={recruiter ? `Remove ${recruiter.name}?` : "Remove"}
      description={recruiter ? <EmailAddress address={recruiter.email} /> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            icon={UserMinus}
            disabled={blocked}
            loading={busy}
            onClick={async () => {
              if (!recruiter) return;
              const r = await run(`remove:${recruiter.id}`, "removeRecruiter", { recruiterId: recruiter.id }, () => `${recruiter.name} no longer has access to the Workspace.`);
              if (r) onClose();
            }}
          >
            Remove from Workspace
          </Button>
        </>
      }
    >
      {recruiter ? (
        blocked ? (
          <Callout tone="warning" title={`${recruiter.name} still owns ${plural(ownedNiches.length, "Niche")}`}>
            Move {ownedNiches.map((n) => n.name).join(", ")} to another Recruiter in Niche ownership first.
          </Callout>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-zinc-700">
            <li>They lose access immediately.</li>
            <li>Their Claims are released, so others can add those people to a Campaign.</li>
            <li>Their Sending Mailboxes stop sending; the mailboxes stay in your tenant.</li>
            <li>API Keys acting for them are revoked.</li>
          </ul>
        )
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Niche ownership                                                     */
/* ------------------------------------------------------------------ */

function NicheOwnership({ s, canManage, pending, run }: { s: ClientState; canManage: boolean; pending: string | null; run: Runner }) {
  const active = s.recruiters.filter((r) => r.status === "active");
  return (
    <Card
      title="Niche ownership"
      description="Each Niche is owned by one Recruiter: its Feed, agent runs and Digest are theirs. Campaigns keep their own owner."
      bodyClassName={s.niches.length === 0 ? undefined : "divide-y divide-zinc-100"}
    >
      {s.niches.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No Niches yet"
          description="Set up a first Niche to start finding Prospects and Candidates."
          action={
            <Link href="/onboarding/niche" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Set up a Niche
            </Link>
          }
        />
      ) : (
        s.niches.map((n) => {
          const campaigns = s.campaigns.filter((c) => c.nicheId === n.id).length;
          return (
            <div key={n.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/niches/${n.id}`} className="min-w-0 truncate text-sm font-medium text-zinc-900 hover:text-indigo-600">
                    {n.name}
                  </Link>
                  <Badge tone={NICHE_TONE[n.status]}>{NICHE_STATUS_LABELS[n.status]}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Runs {formatWeekdays(n.schedule.days)} at {n.schedule.time} - {plural(campaigns, "Campaign")}
                  {n.lastRunOn ? ` - last run ${formatRelative(n.lastRunOn, s.clock.today)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-zinc-500">Owner</span>
                {canManage ? (
                  <Select
                    aria-label={`Owner of ${n.name}`}
                    className="w-44"
                    value={n.ownerId}
                    disabled={pending === `niche:${n.id}`}
                    onChange={(e) => {
                      const ownerId = e.target.value;
                      void run(`niche:${n.id}`, "updateNiche", { nicheId: n.id, ownerId }, () => `${n.name} now belongs to ${recruiterName(s, ownerId)}.`);
                    }}
                  >
                    {active.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-zinc-800">
                    <Avatar name={recruiterName(s, n.ownerId)} size="sm" />
                    {recruiterName(s, n.ownerId)}
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

function ClaimsCard({
  s,
  claims,
  meId,
  isOwner,
  pending,
  run,
}: {
  s: ClientState;
  claims: ClaimRow[];
  meId: string | null;
  isOwner: boolean;
  pending: string | null;
  run: Runner;
}) {
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [showAll, setShowAll] = useState(false);
  const filtered = filter === "mine" ? claims.filter((c) => c.claim.recruiterId === meId) : claims;
  const rows = showAll ? filtered : filtered.slice(0, CLAIMS_PAGE);
  return (
    <Card
      title="Claims"
      description={`Adding someone to a Campaign gives that Recruiter the exclusive right to contact them. Others see "Claimed by" and cannot add them. A Claim lapses after ${RETENTION.claimInactivityDays} days without activity.`}
      actions={
        <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 text-xs">
          {(["all", "mine"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cx("rounded px-2.5 py-1 font-medium", filter === f ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800")}
            >
              {f === "all" ? `All (${claims.length})` : `Mine (${claims.filter((c) => c.claim.recruiterId === meId).length})`}
            </button>
          ))}
        </div>
      }
      bodyClassName="p-0"
    >
      {filtered.length === 0 ? (
        <EmptyState icon={Hourglass} title={filter === "mine" ? "You hold no Claims" : "No Claims"} description="Claims appear when people are added to a Campaign." />
      ) : (
        <div>
          <ul className="divide-y divide-zinc-100 sm:hidden">
            {rows.map((row) => {
              const campaign = s.campaigns.find((c) => c.id === row.claim.campaignId);
              const mine = row.claim.recruiterId === meId;
              const key = `release:${row.kind}:${row.id}`;
              const href = personHref(row.kind, row.id, s);
              return (
                <li key={`${row.kind}:${row.id}`} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {href ? (
                        <Link href={href} className="text-sm font-medium text-zinc-900">
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-zinc-900">{row.name}</span>
                      )}
                      <Badge tone={row.kind === "candidate" ? "sky" : "neutral"}>{PERSON_KIND_LABELS[row.kind]}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {recruiterName(s, row.claim.recruiterId)}
                      {mine ? " (you)" : ""} - {campaign?.name ?? "Campaign"}
                    </p>
                    <p className="text-xs text-zinc-500">Lapses on {formatDate(row.claim.expiresOn)}</p>
                  </div>
                  {mine || isOwner ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={pending === key}
                      onClick={() => void run(key, "releaseClaim", { person: { kind: row.kind, id: row.id } }, () => `Claim on ${row.name} released.`)}
                    >
                      Release
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-5 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Claimed by</th>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Since</th>
                <th className="px-3 py-2 font-medium">Lapses on</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => {
                const campaign = s.campaigns.find((c) => c.id === row.claim.campaignId);
                const href = personHref(row.kind, row.id, s);
                const mine = row.claim.recruiterId === meId;
                const key = `release:${row.kind}:${row.id}`;
                return (
                  <tr key={`${row.kind}:${row.id}`} className="align-middle">
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        {href ? (
                          <Link href={href} className="font-medium text-zinc-900 hover:text-indigo-600">
                            {row.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-zinc-900">{row.name}</span>
                        )}
                        <Badge tone={row.kind === "candidate" ? "sky" : "neutral"}>{PERSON_KIND_LABELS[row.kind]}</Badge>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700">
                      {recruiterName(s, row.claim.recruiterId)}
                      {mine ? <span className="text-zinc-400"> (you)</span> : null}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-zinc-700">
                      {campaign ? (
                        <Link href={`/campaigns/${campaign.id}`} className="hover:text-indigo-600">
                          {campaign.name}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-500">{formatDate(row.claim.since)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-500">
                      {formatDate(row.claim.expiresOn)}
                      {daysUntil(row.claim.expiresOn, s.clock.today) <= 30 ? (
                        <Badge tone="amber" className="ml-2">
                          {formatRelative(row.claim.expiresOn, s.clock.today)}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {mine || isOwner ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={pending === key}
                          onClick={() => void run(key, "releaseClaim", { person: { kind: row.kind, id: row.id } }, () => `Claim on ${row.name} released.`)}
                        >
                          Release
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {filtered.length > CLAIMS_PAGE ? (
            <div className="border-t border-zinc-100 px-5 py-2.5 text-center">
              <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show all ${filtered.length} Claims`}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Prototype helper                                                    */
/* ------------------------------------------------------------------ */

function ActAs({ s, pending, run }: { s: ClientState; pending: string | null; run: Runner }) {
  const me = s.derived.currentRecruiter;
  const others = s.recruiters.filter((r) => r.status === "active" && r.id !== me?.id);
  if (others.length === 0) return null;
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-zinc-800">
            <Repeat className="size-4 text-zinc-500" aria-hidden />
            Act as another Recruiter
            <span className="rounded bg-zinc-200 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Prototype only</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            You are {me?.name ?? "nobody"}. Switch to see Claims, Niches and the Feed from a teammate&apos;s side.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {others.map((r) => (
            <Button
              key={r.id}
              size="sm"
              loading={pending === `as:${r.id}`}
              onClick={() => void run(`as:${r.id}`, "switchRecruiter", { recruiterId: r.id }, () => `You are now acting as ${r.name}.`)}
            >
              Act as {r.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
