"use client";

// Landing page: one-sentence pitch, "Start free with Google / Microsoft" (work accounts only),
// and what the free Test Run gives.

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  FlaskConical,
  Gauge,
  Lock,
  MessagesSquare,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ThumbsUp,
  UserRound,
} from "lucide-react";
import { formatCreditsLabel } from "@/lib/format";
import type { AuthProvider } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { PROVIDER_NAMES, ProductMark, ProviderMark } from "./shared";
import { Badge, ButtonLink, Skeleton, buttonClass, cx } from "./ui";

function StartButtons({ size = "lg" }: { size?: "md" | "lg" }) {
  const providers: AuthProvider[] = ["google", "microsoft"];
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      {providers.map((p) => (
        <Link
          key={p}
          href={`/signup?provider=${p}`}
          className={buttonClass(p === "google" ? "dark" : "secondary", size, "sm:min-w-[220px]")}
        >
          <span className={cx("inline-flex items-center justify-center rounded-sm", p === "google" ? "bg-white p-0.5" : "")}>
            <ProviderMark provider={p} className="size-3.5" />
          </span>
          Start free with {PROVIDER_NAMES[p]}
        </Link>
      ))}
    </div>
  );
}

const SAMPLE_LINES = [
  { label: "Funding round: Series B, €32M", age: "12 days ago", points: 35, decay: "0.91", contribution: "+31.9" },
  { label: "Job posting: Senior Backend Engineer", age: "4 days ago", points: 30, decay: "0.91", contribution: "+27.3" },
  { label: "New leader: CTO joined", age: "20 days ago", points: 25, decay: "0.79", contribution: "+19.8" },
];

function SampleFeedItem() {
  return (
    <div className="relative isolate">
      <div className="absolute -inset-4 -z-10 hidden rounded-3xl sm:block bg-gradient-to-br from-indigo-100/70 via-white to-zinc-100" aria-hidden />
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/5">
        {/* On a phone the mock's lines wrap instead of truncating. */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-2.5 sm:items-center">
          <span className="min-w-0 text-xs font-medium text-zinc-500 sm:truncate">Feed · Fintech backend engineers - Series A-C - Paris</span>
          <Badge tone="indigo" className="shrink-0">
            Free Test Run
          </Badge>
        </div>
        <div className="px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-7 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">F</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">Fintory</div>
                  <div className="text-xs text-zinc-500 sm:truncate">Payments infrastructure · 140 people · Paris</div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-3 text-right">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Fit</div>
                <div className="text-sm font-semibold tabular-nums text-zinc-900">84</div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Signal Strength</div>
                <div className="text-sm font-semibold tabular-nums text-indigo-600">79</div>
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50/70">
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-zinc-500">
              <span>Why 79</span>
              <span className="tabular-nums">weight x decay</span>
            </div>
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
              {SAMPLE_LINES.map((l) => (
                <li key={l.label} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                  <span className="min-w-0">
                    <span className="block text-zinc-800 sm:truncate">{l.label}</span>
                    <span className="text-zinc-400">{l.age}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {l.points} x {l.decay} = <span className="font-semibold text-emerald-700">{l.contribution}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
              <Briefcase className="size-3 text-zinc-400" aria-hidden />
              Senior Backend Engineer
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
              <Briefcase className="size-3 text-zinc-400" aria-hidden />
              Platform Engineer
            </span>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Previews</div>
          {[
            "Hiring Contact: CTO, 12 years, payments, Paris - joined 20 days ago",
            "Candidate: Senior Backend Engineer, 6 years, fintech, Paris - strong move signals",
          ].map((t) => (
            <div key={t} className="flex items-start gap-2 rounded-md border border-dashed border-zinc-300 bg-white px-2.5 py-1.5 text-xs leading-snug text-zinc-600 sm:items-center">
              <Lock className="mt-0.5 size-3 shrink-0 text-zinc-400 sm:mt-0" aria-hidden />
              <span className="min-w-0 sm:truncate">{t}</span>
            </div>
          ))}
          <div className="pt-0.5 text-pretty text-[11px] text-zinc-500">Revealed when you buy Credits, at the normal price per person.</div>
        </div>
      </div>
    </div>
  );
}

const TEST_RUN_GIVES = [
  {
    icon: <Gauge />,
    title: "10 Prospects in full",
    text: "Companies in your Niche with their Signals, Detected Roles and a Signal Strength explained line by line.",
  },
  {
    icon: <UserRound />,
    title: "Hiring Contacts and Candidates as Previews",
    text: "Anonymised one-line summaries and counts. Buying Credits reveals who they are, charged at the normal price per person.",
  },
  {
    icon: <ThumbsUp />,
    title: "Good / bad labels that tune your Niche",
    text: "Mark results good or bad and the agents propose Niche Profile adjustments for you to accept.",
  },
  {
    icon: <FlaskConical />,
    title: "0 Credits, no card",
    text: "One free Test Run per Main Domain, with a work account.",
  },
];

const HOW_IT_WORKS = [
  { icon: <MessagesSquare />, title: "Describe your Niche", text: "Tell the setup agent what you place. It drafts the Niche Profile the agents work from." },
  { icon: <SlidersHorizontal />, title: "Tune it with a Test Run", text: "Label results good or bad, accept the proposed adjustments, set the Fit threshold." },
  { icon: <Sparkles />, title: "Switch the agents on", text: "Buy Credits and pay per outcome: a Surfaced Prospect, a verified email, a sent email." },
  { icon: <Send />, title: "Triage the Feed, run Campaigns", text: "Emails go out in your Voice Profile from your own Sending Mailboxes. You send every reply yourself." },
];

export function Landing() {
  const state = useAppState();
  // The landing content is static: when the backend fails, the header falls back to "Sign in"
  // instead of loading forever (the skeleton is only for the first load, same on server and client).
  const backendError = useBackendError();
  const signedIn = state?.session.signedIn && state.workspace;
  const me = state?.derived.currentRecruiter ?? null;

  return (
    <div className="min-h-full bg-white">
      <header className="border-b border-zinc-100">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
          <ProductMark />
          <div className="flex min-w-0 items-center gap-2">
            {state === null && !backendError ? (
              <Skeleton className="h-8 w-32" />
            ) : signedIn ? (
              <>
                <span className="hidden truncate text-xs text-zinc-500 sm:inline">
                  {me?.name} · {state.workspace?.name} · {formatCreditsLabel(state.workspace?.credits ?? 0)}
                </span>
                <ButtonLink href="/feed" variant="primary" size="md">
                  Open the Feed
                  <ArrowRight aria-hidden />
                </ButtonLink>
              </>
            ) : (
              <ButtonLink href="/signup?provider=google" variant="ghost">
                Sign in
              </ButtonLink>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div className="min-w-0">
          <Badge tone="indigo">For agency and freelance recruiters</Badge>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-[34px] sm:leading-[1.15]">
            Agents that find the companies about to hire and the Candidates ready to move in your Niche, then run the outreach to both.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-600">
            Every morning, Prospects and Candidates ranked by Signal Strength from public, dated Signals such as job postings, funding rounds and leadership changes, each score explained line by line.
          </p>
          <div className="mt-7">
            <StartButtons />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-zinc-400" aria-hidden />
            <span>Work accounts only. Signing in asks for your name and email, never for access to your mailbox.</span>
          </p>
        </div>
        <div className="min-w-0 lg:pl-6">
          <SampleFeedItem />
        </div>
      </section>

      <section className="border-y border-zinc-100 bg-zinc-50/70">
        <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900">What your free Test Run gives you</h2>
              <p className="mt-1 text-sm text-zinc-500">A small agent run on your Niche, in about a minute after sign-up.</p>
            </div>
            <Badge tone="emerald" dot className="self-start sm:self-auto">
              0 Credits · once per Main Domain
            </Badge>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEST_RUN_GIVES.map((g) => (
              <div key={g.title} className="rounded-xl border border-zinc-200 bg-white p-4">
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 [&_svg]:size-4">{g.icon}</span>
                <h3 className="mt-3 text-sm font-semibold text-zinc-900">{g.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{g.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">How it works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.title} className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold tabular-nums text-white">{i + 1}</span>
                <span className="text-zinc-400 [&_svg]:size-4">{s.icon}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-zinc-900">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex flex-col items-start justify-between gap-5 rounded-2xl bg-zinc-900 px-6 py-7 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-white">Start with your free Test Run</h2>
            <p className="mt-1 text-sm text-zinc-400">Sign up, describe your Niche, see your first 10 Prospects.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {(["google", "microsoft"] as const).map((p) => (
              <Link
                key={p}
                href={`/signup?provider=${p}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
              >
                <ProviderMark provider={p} className="size-3.5" />
                Start free with {PROVIDER_NAMES[p]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-2 px-4 py-6 pb-24 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <ProductMark className="text-sm" />
          <p className="max-w-xl sm:text-right">
            Your Workspace is the data controller for the people you contact and Auto Recruit is its processor. Every contact detail keeps its Provenance.
          </p>
        </div>
      </footer>
    </div>
  );
}
