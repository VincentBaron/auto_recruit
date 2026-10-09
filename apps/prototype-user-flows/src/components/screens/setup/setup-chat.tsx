"use client";

// Variant A "Chat": a conversation with the setup agent, the Niche Profile drafted live beside it.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Bot, Check, RotateCcw, Sparkles } from "lucide-react";
import type { ClientState, Niche, SetupMessage } from "@/lib/types";
import { act } from "@/lib/api";
import { NextTestRunNote, TestRunNextStep, nextTestRun } from "./next-test-run";
import { FIELD_LABELS, firstNameOf } from "./options";
import { ProfileDraftPanel, draftFromNiche, type SizeNote } from "./profile-draft-panel";
import { Avatar, Button, ButtonLink, ErrorText, Kbd, cx } from "./ui";

/** Small pause used only in event handlers (the setup agent "typing"). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STAGES: { key: Niche["setupStage"]; label: string }[] = [
  { key: "basics", label: "Sectors, roles, locations" },
  { key: "size", label: "Company size" },
  { key: "candidate", label: "Candidate profile" },
  { key: "done", label: "Drafted" },
];

/**
 * The composer prompts for what the setup agent just asked. Each fits on one line of the composer at
 * 390px wide (about 264px of text).
 */
const COMPOSER_PLACEHOLDERS: Record<Niche["setupStage"], string> = {
  basics: "Sectors, roles and locations you place",
  size: "Company sizes and funding stages",
  candidate: "What makes a Candidate a good Fit",
  done: "Ask for a change, like adding Lyon",
};

/** Same opening as the server's setup agent, shown before the draft Niche exists. */
function localGreeting(name: string | null, today: string): SetupMessage {
  return {
    id: "local-greeting",
    role: "agent",
    text: `Hi ${name ?? "there"}, I'm the setup agent. Describe the placements you make: sectors, roles, locations and seniority. A few lines is enough, I'll draft your Niche Profile as we go.`,
    on: today,
    suggestions: [
      "I place senior backend engineers in Series A to C fintechs in Paris",
      "Product designers for healthtech startups, remote across the EU",
    ],
    updatedFields: [],
  };
}

interface Echo {
  text: string;
  /** Number of server messages when the Recruiter sent this one. */
  base: number;
  reply: SetupMessage | null;
}

export type EnsureNiche = (name?: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

function pendingFields(niche: Niche | null, messages: SetupMessage[]): string[] {
  const stage = niche?.setupStage ?? "basics";
  if (stage === "done" || niche?.setupComplete) return [];
  const touched = new Set(messages.flatMap((m) => m.updatedFields));
  const p = niche?.profile;
  const out = ["candidateProfile", "fitThreshold", "signalWeights", "searchStrategy"];
  if (stage === "basics" || stage === "size") {
    if (!touched.has("companySize")) out.push("companySize");
    if (!p || p.fundingStages.length === 0) out.push("fundingStages");
  }
  return out;
}

/**
 * Past the size question without a size in any answer, the setup agent kept its default range: with
 * funding stages it went straight on from them, without them the Recruiter skipped the question.
 */
function sizeNote(niche: Niche | null, messages: SetupMessage[]): SizeNote {
  if (!niche || niche.setupStage === "basics" || niche.setupStage === "size") return null;
  if (!messages.some((m) => m.role === "recruiter")) return null;
  if (messages.some((m) => m.updatedFields.includes("companySize"))) return null;
  return niche.profile.fundingStages.length > 0 ? "inferred" : "default";
}

/** Bottom room for the prototype pills (simulator, variant switcher) under the composer. */
const PILL_ROOM = "[--pill-room:7.25rem] sm:[--pill-room:4.5rem]";
/** The conversation never gets shorter than this; below it the page scrolls instead. */
const CHAT_MIN_HEIGHT = "26rem";

function TypingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
        <Bot className="size-4" aria-hidden />
      </span>
      <div className="rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-3.5 py-3" aria-label="The setup agent is drafting">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

function MessageBubble({ m, recruiterName }: { m: SetupMessage; recruiterName: string }) {
  if (m.role === "recruiter") {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-indigo-600 px-3.5 py-2.5 text-sm leading-relaxed text-white [overflow-wrap:anywhere]">{m.text}</div>
        <Avatar name={recruiterName} />
      </div>
    );
  }
  const fields = m.updatedFields.filter((f) => FIELD_LABELS[f]);
  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
        <Bot className="size-4" aria-hidden />
      </span>
      <div className="max-w-[85%] min-w-0">
        <div className="rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-800 [overflow-wrap:anywhere]">{m.text}</div>
        {fields.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-1 text-[11px] text-indigo-600">
            <Sparkles className="size-3" aria-hidden />
            <span>Updated</span>
            {fields.map((f) => (
              <span key={f} className="rounded bg-indigo-50 px-1.5 py-px font-medium">
                {FIELD_LABELS[f]}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SetupChat({
  state,
  niche,
  ensureNiche,
  onStartNew,
}: {
  state: ClientState;
  niche: Niche | null;
  ensureNiche: EnsureNiche;
  onStartNew: () => void;
}) {
  const me = state.derived.currentRecruiter;
  const [input, setInput] = useState("");
  const [echo, setEcho] = useState<Echo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The chat fills the viewport below the page header and stepper, with the composer above the
  // prototype pills: its height is 100dvh minus its measured top in the document and the pill room.
  // Re-measured when anything above it changes size (header wrapping, a notice appearing).
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const measure = () => setTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const server = niche?.setupMessages ?? [];
  const withGreeting = server.length > 0 && server[0].role === "agent" ? server : [localGreeting(me ? firstNameOf(me.name) : null, state.clock.today), ...server];
  const echoLanded = echo !== null && server.slice(echo.base).some((m) => m.role === "recruiter" && m.text === echo.text);
  const activeEcho = echo && !echoLanded ? echo : null;
  const display: SetupMessage[] = activeEcho
    ? [
        ...withGreeting,
        { id: "echo-recruiter", role: "recruiter", text: activeEcho.text, on: state.clock.today, suggestions: [], updatedFields: [] },
        ...(activeEcho.reply ? [activeEcho.reply] : []),
      ]
    : withGreeting;
  const typing = activeEcho !== null && activeEcho.reply === null;
  const lastAgent = [...display].reverse().find((m) => m.role === "agent") ?? null;
  const complete = Boolean(niche?.setupComplete);
  const stage: Niche["setupStage"] = niche?.setupStage ?? "basics";
  const stageIndex = STAGES.findIndex((s) => s.key === stage);
  const busy = echo !== null && !echoLanded;
  const next = nextTestRun(state);

  useEffect(() => {
    if (echoLanded) setEcho(null);
  }, [echoLanded]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [display.length, typing]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setEcho({ text, base: server.length, reply: null });
    await sleep(650);
    // Left the page while the agent was "typing": no draft Niche is created and nothing is sent.
    if (!alive.current) return;
    let nicheId = niche?.id ?? null;
    if (!nicheId) {
      const created = await ensureNiche();
      if (!alive.current) return;
      if (!created.ok) {
        setEcho(null);
        setInput(text);
        setError(created.error);
        return;
      }
      nicheId = created.id;
    }
    const res = await act("nicheChatMessage", { nicheId, text });
    if (!alive.current) return;
    if (!res.ok) {
      setEcho(null);
      setInput(text);
      setError(res.error);
      return;
    }
    setEcho((e) => (e && e.text === text ? { ...e, reply: res.result.reply } : e));
    inputRef.current?.focus();
  };

  const draft = draftFromNiche(niche);
  const highlighted = lastAgent?.updatedFields ?? [];
  const reviewHref = niche ? `/niches/${niche.id}` : "/niches";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section
        ref={sectionRef}
        className={cx("flex min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs lg:self-start", PILL_ROOM)}
        style={{ height: top === null ? CHAT_MIN_HEIGHT : `max(${CHAT_MIN_HEIGHT}, calc(100dvh - ${top}px - var(--pill-room)))` }}
      >
        <div className="shrink-0 border-b border-zinc-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                <Bot className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Setup agent</div>
                <div className="text-xs text-zinc-500">Drafts your Niche Profile as you answer. Nothing runs until you review it.</div>
              </div>
            </div>
            {complete ? (
              <Button variant="ghost" size="sm" onClick={onStartNew}>
                <RotateCcw aria-hidden />
                New setup
              </Button>
            ) : null}
          </div>
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Setup progress">
            {STAGES.map((s, i) => {
              const done = i < stageIndex || complete;
              const current = i === stageIndex && !complete;
              return (
                <li
                  key={s.key}
                  className={cx(
                    "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium",
                    current ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200" : done ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                  )}
                >
                  {done ? <Check className="size-3" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
                  {s.label}
                </li>
              );
            })}
          </ol>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-zinc-50/60 px-4 py-5" aria-live="polite">
          {display.map((m) => (
            <MessageBubble key={m.id} m={m} recruiterName={me?.name ?? "Recruiter"} />
          ))}
          {typing ? <TypingBubble /> : null}
          {complete && !busy ? (
            <div className="ml-9 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <Check className="size-4" aria-hidden />
                Your Niche Profile is drafted
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-emerald-900/80">
                Review and adjust it, or keep chatting to change any field. Then <TestRunNextStep next={next} />
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href={reviewHref} variant="primary" size="md">
                  Review Niche Profile
                  <ArrowRight aria-hidden />
                </ButtonLink>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
          {lastAgent && lastAgent.suggestions.length > 0 && !busy && !complete ? (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {lastAgent.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="inline-flex max-w-full items-center rounded-full border border-indigo-200 bg-indigo-50/60 px-2.5 py-1 text-left text-xs text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 rounded-lg border border-zinc-300 bg-white p-1.5 pl-3 shadow-xs focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
          >
            <textarea
              ref={inputRef}
              value={input}
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={COMPOSER_PLACEHOLDERS[complete ? "done" : stage]}
              aria-label="Message the setup agent"
              className="min-h-10 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <Button type="submit" variant="primary" size="md" disabled={!input.trim() || busy} aria-label="Send" className="size-8 px-0">
              <ArrowUp aria-hidden />
            </Button>
          </form>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <ErrorText>{error}</ErrorText>
            <span className="ml-auto hidden text-[11px] text-zinc-400 sm:inline">
              <Kbd>Enter</Kbd> to send, <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> for a new line
            </span>
          </div>
        </div>
      </section>

      <div className="min-w-0 lg:sticky lg:top-[calc(var(--chrome-h)+1rem)] lg:self-start">
        <ProfileDraftPanel
          draft={draft}
          pending={pendingFields(niche, display)}
          sizeNote={sizeNote(niche, display)}
          highlighted={highlighted}
          complete={complete}
          footer={
            complete ? (
              <div className="flex flex-col gap-2">
                <ButtonLink href={reviewHref} variant="primary" className="w-full">
                  Review Niche Profile
                  <ArrowRight aria-hidden />
                </ButtonLink>
                <NextTestRunNote next={next} />
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Every field stays editable after the draft. Signal weights and the Fit threshold start from sensible defaults.</p>
            )
          }
        />
      </div>
    </div>
  );
}
