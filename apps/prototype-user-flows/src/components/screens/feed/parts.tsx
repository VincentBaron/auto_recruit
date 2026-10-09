"use client";

// Small domain pieces shared by the Feed variants: Claim, retention countdown, lifecycle, Detected
// Role chips, contact values with their Provenance.

import Link from "next/link";
import type { ReactNode } from "react";
import { Briefcase, ExternalLink, Hourglass, Lock, Mail, ShieldCheck, Smartphone, UserCheck } from "lucide-react";
import { LifecycleBadge, RetentionBadge } from "@/components/domain/person-badges";
import { formatDate, formatRelative } from "@/lib/format";
import { CONTACT_KIND_LABELS, METHOD_LABELS, PROVIDER_LABELS, VERIFICATION_LABELS } from "@/lib/labels";
import type { Candidate, ContactValue, DetectedRole, Lifecycle, Niche, ProspectStatus, Verification } from "@/lib/types";
import { type ClaimInfo, type FeedModel, nicheName, nicheShortName, onRetentionHold, retentionInfo } from "./model";
import { Badge, type BadgeTone, cx } from "./ui";

export function ClaimBadge({ info, compact = false }: { info: ClaimInfo; compact?: boolean }) {
  if (info.kind === "none") return null;
  if (info.kind === "other") {
    return (
      <Badge
        tone="warning"
        icon={<Lock className="size-3" aria-hidden />}
        title={`Claimed by ${info.recruiterName} until ${formatDate(info.claim.expiresOn)} unless active. Only ${info.recruiterName} can contact this person.`}
      >
        {compact ? info.recruiterName : `Claimed by ${info.recruiterName}`}
      </Badge>
    );
  }
  return (
    <Badge
      tone="indigo"
      icon={<UserCheck className="size-3" aria-hidden />}
      title={info.campaignName ? `Your Claim, through the Campaign "${info.campaignName}"` : "Your Claim"}
    >
      {compact ? "Your Claim" : "Claimed by you"}
    </Badge>
  );
}

/** Core's retention countdown, "On hold: Data Request" while an open Data Request concerns the Candidate. */
export function CandidateRetentionBadge({ candidate, model }: { candidate: Candidate; model: FeedModel }) {
  return <RetentionBadge deleteOn={candidate.deleteOn} today={model.today} onHold={onRetentionHold(model, candidate)} />;
}

/** Core's lifecycle pill, left out for Surfaced people: in the Feed, everyone not marked is Surfaced. */
export function PersonLifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return lifecycle === "surfaced" ? null : <LifecycleBadge lifecycle={lifecycle} />;
}

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  if (status === "in_campaign") return <Badge tone="indigo">In a Campaign</Badge>;
  if (status === "dismissed") return <Badge tone="neutral">Dismissed</Badge>;
  if (status === "replied") return <Badge tone="indigo">Replied</Badge>;
  if (status === "closed") return <Badge tone="neutral">Closed</Badge>;
  return null;
}

/** The Niche as a coloured dot (name in the tooltip); the caption above the Feed is its legend. */
export function NicheDot({ niche, className }: { niche: Niche | undefined; className?: string }) {
  return (
    <span className={cx("inline-block size-1.5 shrink-0 rounded-full", nicheDot(niche?.id), className)} title={niche ? `Niche: ${nicheName(niche)}` : undefined}>
      <span className="sr-only">{niche ? `Niche: ${nicheName(niche)}` : ""}</span>
    </span>
  );
}

const RETENTION_TEXT: Record<"neutral" | "warning" | "danger" | "success", string> = {
  neutral: "text-zinc-700",
  warning: "text-amber-800",
  danger: "text-rose-700",
  success: "text-emerald-700",
};

/** Full retention sentence, for detail views ("Deleted in 18 days unless contacted ..."). */
export function RetentionLine({ candidate, model }: { candidate: Candidate; model: FeedModel }) {
  const onHold = onRetentionHold(model, candidate);
  const info = retentionInfo(candidate, model.today, onHold);
  if (!info) return null;
  const Icon = onHold ? Lock : Hourglass;
  return (
    <p className={cx("flex items-start gap-2 text-sm", RETENTION_TEXT[info.tone])}>
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{info.long}</span>
    </p>
  );
}

export function NicheLabel({ niche, className }: { niche: Niche | undefined; className?: string }) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-500", className)} title={niche ? nicheName(niche) : undefined}>
      <span className={cx("size-1.5 shrink-0 rounded-full", nicheDot(niche?.id))} aria-hidden />
      <span className="truncate">{nicheShortName(niche)}</span>
    </span>
  );
}

const DOTS = ["bg-indigo-500", "bg-teal-500", "bg-amber-500", "bg-fuchsia-500", "bg-sky-500"];
function nicheDot(id: string | undefined): string {
  if (!id) return "bg-zinc-300";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DOTS[h % DOTS.length];
}

/**
 * Detected Role chips linking to the Prospect page. `wrap` lets a long title break onto a second line
 * instead of being cut (the full title is always in the tooltip).
 */
export function RoleChips({
  roles,
  max = 2,
  today,
  empty = true,
  wrap = false,
}: {
  roles: DetectedRole[];
  max?: number;
  today: string;
  empty?: boolean;
  wrap?: boolean;
}) {
  if (roles.length === 0) return empty ? <span className="text-xs text-zinc-400">None detected</span> : null;
  const shown = roles.slice(0, max);
  const rest = roles.slice(shown.length);
  return (
    <span className={cx("flex min-w-0 gap-1", wrap ? "items-start" : "items-center")}>
      {shown.map((r) => (
        <Link
          key={r.id}
          href={`/prospects/${r.prospectId}#role-${r.id}`}
          onClick={(e) => e.stopPropagation()}
          title={`${r.title} · ${r.location} · posted ${formatRelative(r.postedOn, today)}${r.stale ? " · open more than 30 days or reposted" : ""}`}
          className={cx(
            "inline-flex max-w-full min-w-0 items-start gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
            r.stale ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100" : "bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100",
          )}
        >
          <Briefcase className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className={wrap ? "break-words" : "truncate"}>{r.title}</span>
        </Link>
      ))}
      {rest.length > 0 ? (
        <span className={cx("shrink-0 text-xs text-zinc-400 tabular-nums", wrap && "pt-0.5")} title={rest.map((r) => r.title).join(" · ")}>
          +{rest.length}
        </span>
      ) : null}
    </span>
  );
}

const VERIFICATION_TONE: Record<Verification, BadgeTone> = {
  valid: "success",
  catch_all: "warning",
  invalid: "danger",
  unverified: "neutral",
};

export function VerificationBadge({ verification }: { verification: Verification }) {
  return (
    <Badge tone={VERIFICATION_TONE[verification]} icon={verification === "valid" ? <ShieldCheck className="size-3" aria-hidden /> : undefined}>
      {VERIFICATION_LABELS[verification]}
    </Badge>
  );
}

/** One contact value with its verification and Provenance (ADR-0005). */
export function ContactValueRow({ value, today }: { value: ContactValue; today: string }) {
  const Icon = value.kind === "mobile" ? Smartphone : Mail;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-zinc-900 select-all">{value.value}</span>
          <VerificationBadge verification={value.verification} />
          <span className="text-[11px] text-zinc-400">{CONTACT_KIND_LABELS[value.kind]}</span>
        </div>
        <ProvenanceLine value={value} today={today} />
      </div>
    </div>
  );
}

/**
 * Items joined by " · ", each separator kept with the item after it, so a wrapped line never ends on
 * a dangling dot.
 */
export function MetaItems({ items, gap = "gap-x-1.5" }: { items: ReactNode[]; gap?: string }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i} className={cx("inline-flex min-w-0 items-center", gap)}>
          {i > 0 ? <span aria-hidden>·</span> : null}
          {item}
        </span>
      ))}
    </>
  );
}

export function ProvenanceLine({ value, today }: { value: ContactValue; today: string }) {
  const p = value.provenance;
  return (
    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-zinc-500">
      <span className="font-medium text-zinc-600">Provenance:</span>
      <MetaItems
        items={[
          <span key="provider">{PROVIDER_LABELS[p.provider]}</span>,
          <span key="method">{METHOD_LABELS[p.method]}</span>,
          <span key="found" className="inline-flex items-center gap-1.5">
            <span title={formatDate(p.foundOn)}>found {formatRelative(p.foundOn, today)}</span>
            <a
              href={p.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline"
              title="The public page or provider record this value came from"
            >
              record
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </span>,
        ]}
      />
    </p>
  );
}
