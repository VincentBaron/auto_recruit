"use client";

// Deleting a Niche on /niches/[id]: the side card says up front what blocks the deletion (and how to
// unblock it when the app can), and the confirm dialog lists exactly what goes, computed from the
// state with the same rules as the dummy backend's deleteNiche (src/lib/niche-impact.ts).

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { Pause, Trash2, TriangleAlert } from "lucide-react";
import { formatCreditsLabel, plural } from "@/lib/format";
import { nicheDeletionImpact, type NicheDeletionImpact } from "@/lib/niche-impact";
import { openDataRequestFor } from "@/lib/retention";
import type { ClientState, Niche } from "@/lib/types";
import { Button, Card, CardBody, CardHeader, ErrorText, Field, Modal, inputClass } from "./ui";

interface Blocker {
  key: string;
  text: ReactNode;
  action: ReactNode;
}

function campaignLinks(campaigns: { id: string; name: string }[]): ReactNode {
  return campaigns.map((c, i) => (
    <Fragment key={c.id}>
      {i > 0 ? ", " : null}
      <Link href={`/campaigns/${c.id}`} className="font-medium text-indigo-600 underline-offset-2 hover:text-indigo-500 hover:underline">
        {c.name}
      </Link>
    </Fragment>
  ));
}

/**
 * What stops this Niche from being deleted now. A blocker the Recruiter cannot lift (permission,
 * Campaigns that sent emails) is shown alone; otherwise every blocker is listed with its way out.
 */
function deleteBlockers(state: ClientState, niche: Niche, impact: NicheDeletionImpact, onPause: () => void, pausing: boolean): Blocker[] {
  const me = state.derived.currentRecruiter;
  const owner = state.recruiters.find((r) => r.id === niche.ownerId);
  if (me && niche.ownerId !== me.id && me.role !== "owner") {
    return [{ key: "permission", text: `Only ${owner?.name ?? "its owner"} or an Owner can delete this Niche.`, action: null }];
  }
  const pauseButton = (
    <Button size="sm" onClick={onPause} loading={pausing}>
      <Pause aria-hidden />
      Pause agents
    </Button>
  );
  if (impact.campaignsWithSends.length > 0) {
    return [
      {
        key: "campaigns",
        text: (
          <>
            {impact.campaignsWithSends.length === 1 ? "A Campaign of this Niche has" : "Campaigns of this Niche have"} sent emails: {campaignLinks(impact.campaignsWithSends)}. Their history stays for
            the audit trail, so this Niche cannot be deleted.
            {niche.status === "active" ? " To stop spending Credits on it, pause its agents instead." : null}
          </>
        ),
        action: niche.status === "active" ? pauseButton : null,
      },
    ];
  }
  const blockers: Blocker[] = [];
  const held = [
    ...impact.candidateIds.map((id) => ({ kind: "candidate" as const, id })),
    ...impact.hiringContactIds.map((id) => ({ kind: "hiring_contact" as const, id })),
  ]
    .map((ref) => openDataRequestFor(state, ref))
    .find((dr) => dr !== null);
  if (held) {
    blockers.push({
      key: "data-request",
      text: (
        <>
          The open Data Request of <span className="font-medium">{held.personQuery}</span> concerns people of this Niche. Complete it before deleting the Niche.
        </>
      ),
      action: (
        <Link href="/settings/privacy" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
          Open Data &amp; privacy
        </Link>
      ),
    });
  }
  if (niche.status === "active") {
    blockers.push({ key: "active", text: "Pause the agents first: they still run for this Niche.", action: pauseButton });
  }
  return blockers;
}

export function DeleteNicheCard({
  state,
  niche,
  onDelete,
  onPause,
  pausing,
}: {
  state: ClientState;
  niche: Niche;
  onDelete: () => void;
  onPause: () => void;
  pausing: boolean;
}) {
  const impact = nicheDeletionImpact(state, niche.id);
  const blockers = deleteBlockers(state, niche, impact, onPause, pausing);
  return (
    <Card>
      <CardHeader title="Delete Niche" icon={<Trash2 />} />
      <CardBody className="space-y-3">
        <p className="text-[13px] leading-relaxed text-zinc-600">
          Deletes the Niche Profile, its schedule and Test Run results, and the Prospects and people found only for this Niche.
        </p>
        {blockers.map((b) => (
          <div key={b.key} className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-900">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <div>{b.text}</div>
              {b.action ? <div className="mt-2">{b.action}</div> : null}
            </div>
          </div>
        ))}
        <Button variant="danger" onClick={onDelete} disabled={blockers.length > 0} className="w-full">
          <Trash2 aria-hidden />
          Delete Niche
        </Button>
      </CardBody>
    </Card>
  );
}

function ImpactRow({ label, count, detail }: { label: string; count: number; detail?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="min-w-0 text-zinc-600">
        {label}
        {detail ? <span className="mt-0.5 block text-xs text-zinc-500">{detail}</span> : null}
      </dt>
      <dd className={count > 0 ? "shrink-0 font-medium tabular-nums text-zinc-900" : "shrink-0 tabular-nums text-zinc-400"}>{count}</dd>
    </div>
  );
}

const creditsOf = (people: { contactValues: { creditsCharged: number }[] }[]) =>
  people.reduce((sum, p) => sum + p.contactValues.reduce((s, v) => s + v.creditsCharged, 0), 0);

function enrichedDetail(enriched: number, credits: number): string | undefined {
  if (enriched === 0) return undefined;
  return credits > 0 ? `${enriched} Enriched, ${formatCreditsLabel(credits)} of contact details` : `${enriched} Enriched`;
}

/** Mounted only while open, so the typed confirmation starts empty every time. */
export function DeleteNicheDialog({
  state,
  niche,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  state: ClientState;
  niche: Niche;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [typed, setTyped] = useState("");
  const name = niche.name || "Untitled Niche";
  const impact = nicheDeletionImpact(state, niche.id);
  const hiringContacts = new Set(impact.hiringContactIds);
  const candidates = new Set(impact.candidateIds);
  const hcCredits = creditsOf(state.hiringContacts.filter((h) => hiringContacts.has(h.id)));
  const candidateCredits = creditsOf(state.candidates.filter((c) => candidates.has(c.id)));
  const people = impact.hiringContactsEnriched + impact.candidatesEnriched;
  // Typing the name is asked only when paid-for contact details or Campaigns go with the Niche.
  const mustType = people > 0 || impact.campaignsToDelete.length > 0;
  const confirmed = !mustType || typed.trim() === name.trim();
  const nothingElse = impact.prospectIds.length + impact.hiringContactIds.length + impact.candidateIds.length + impact.campaignsToDelete.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete this Niche?"
      description={`"${name}", its Niche Profile, schedule and Test Run results are deleted. This cannot be undone.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!confirmed} onClick={onConfirm}>
            <Trash2 aria-hidden />
            Delete Niche
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {nothingElse ? (
          <p className="text-[13px] leading-relaxed text-zinc-600">No Prospect, Hiring Contact, Candidate or Campaign was found for this Niche yet: nothing else is deleted.</p>
        ) : (
          <div className="rounded-lg border border-zinc-200 px-3 py-1.5">
            <div className="pt-1 text-xs font-medium text-zinc-700">Also deleted, found only for this Niche</div>
            <dl className="divide-y divide-zinc-100 text-sm">
              <ImpactRow label="Prospects, with their Detected Roles" count={impact.prospectIds.length} />
              <ImpactRow label="Hiring Contacts" count={impact.hiringContactIds.length} detail={enrichedDetail(impact.hiringContactsEnriched, hcCredits)} />
              <ImpactRow label="Candidates" count={impact.candidateIds.length} detail={enrichedDetail(impact.candidatesEnriched, candidateCredits)} />
              <ImpactRow
                label="Draft Campaigns"
                count={impact.campaignsToDelete.length}
                detail={impact.campaignsToDelete.length > 0 ? `${impact.campaignsToDelete.map((c) => c.name).join(", ")}: never sent an email, their Claims are released` : undefined}
              />
            </dl>
          </div>
        )}
        {!nothingElse ? (
          <p className="text-xs leading-relaxed text-zinc-500">
            Prospects and Candidates also found for another Niche stay. Deleted people are not added to the Suppression List.
          </p>
        ) : null}
        {mustType ? (
          <Field
            label={
              <>
                Type <span className="font-semibold text-zinc-900">{name}</span> to confirm
              </>
            }
            htmlFor="delete-niche-name"
            hint={people > 0 ? `${plural(people, "Enriched person", "Enriched people")} and the contact details paid for are deleted with it.` : undefined}
          >
            <input
              id="delete-niche-name"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmed && !busy) onConfirm();
              }}
            />
          </Field>
        ) : null}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
