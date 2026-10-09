"use client";

// /onboarding/niche: variant A "Chat" and variant B "Wizard" (?variant=A|B), both ending with a drafted
// Niche Profile and "Review Niche Profile". Both work on the same draft Niche, created on first use.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ListChecks } from "lucide-react";
import { act, useAppState, useBackendError } from "@/lib/api";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { VariantSwitcher, type VariantOption } from "@/components/shell/variant-switcher";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { nextTestRun } from "./next-test-run";
import { latestOpenDraft } from "./options";
import type { EnsureNiche } from "./setup-chat";
import { SetupChat } from "./setup-chat";
import { SetupWizard } from "./setup-wizard";
import { NotSignedIn, OnboardingSteps, PageSkeleton } from "./shared";
import { ButtonLink } from "./ui";

const VARIANTS: VariantOption[] = [
  { key: "A", label: "Chat" },
  { key: "B", label: "Wizard" },
];

const DESCRIPTION = "The setup agent drafts the Niche Profile the Prospection and Sourcing Agents work from. You review and approve it before anything runs.";

export function NicheSetup() {
  const state = useAppState();
  const backendError = useBackendError();
  const pathname = usePathname();
  const params = useSearchParams();
  const variant = params.get("variant") === "B" ? "B" : "A";
  const paramNiche = params.get("niche");

  /** undefined until the first loaded state picks the draft to continue (or none). */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  /** A Niche created here that the polled state may not include yet. */
  const [created, setCreated] = useState<string | null>(null);
  const creating = useRef<ReturnType<EnsureNiche> | null>(null);

  const me = state?.derived.currentRecruiter ?? null;
  const derivedId = state
    ? paramNiche && state.niches.some((n) => n.id === paramNiche)
      ? paramNiche
      : (latestOpenDraft(state.niches, me?.id ?? null)?.id ?? null)
    : null;
  const nicheId = chosen !== undefined ? chosen : derivedId;
  const exists = Boolean(state && nicheId && state.niches.some((n) => n.id === nicheId));
  const effectiveId = nicheId && (exists || nicheId === created) ? nicheId : null;
  const niche = state && effectiveId ? (state.niches.find((n) => n.id === effectiveId) ?? null) : null;

  useEffect(() => {
    if (chosen === undefined && state) setChosen(derivedId);
  }, [chosen, state, derivedId]);

  useEffect(() => {
    if (created && exists && nicheId === created) setCreated(null);
  }, [created, exists, nicheId]);

  // Native history update (synced with useSearchParams by Next.js) so the page does not re-render from
  // scratch while a message to the setup agent is in flight. A reload then resumes the same draft.
  // Without a draft there is no Wizard step to resume either.
  const replaceParams = useCallback(
    (nextNiche: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (nextNiche) sp.set("niche", nextNiche);
      else {
        sp.delete("niche");
        sp.delete("step");
      }
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname],
  );

  const ensureNiche: EnsureNiche = useCallback(
    async (name) => {
      if (effectiveId) return { ok: true, id: effectiveId };
      if (!creating.current) {
        creating.current = act("createNiche", name ? { name } : {}).then((res) => {
          creating.current = null;
          if (!res.ok) return { ok: false, error: res.error } as const;
          const id = res.result.nicheId;
          setCreated(id);
          setChosen(id);
          replaceParams(id);
          return { ok: true, id } as const;
        });
      }
      return creating.current;
    },
    [effectiveId, replaceParams],
  );

  const startNew = useCallback(() => {
    setChosen(null);
    setCreated(null);
    replaceParams(null);
  }, [replaceParams]);

  const switcher = <VariantSwitcher variants={VARIANTS} current={variant} label="Niche setup variant" />;
  const title = variant === "A" ? "Describe your Niche to the setup agent" : "Set up your Niche step by step";

  if (state === null) {
    return (
      <>
        {backendError ? <BackendErrorState error={backendError} /> : <PageSkeleton variant="split" />}
        {switcher}
      </>
    );
  }
  if (!state.session.signedIn || !state.workspace) {
    return (
      <>
        <NotSignedIn eyebrow="Niche setup" title={title} description={DESCRIPTION} what="set up your first Niche" />
        {switcher}
      </>
    );
  }

  const hasLiveNiche = state.niches.some((n) => n.status === "active" || n.status === "paused");
  const otherNiches = state.niches.filter((n) => n.id !== effectiveId).length;

  return (
    <PageContainer>
      {!hasLiveNiche ? (
        <OnboardingSteps current={niche?.setupComplete ? 1 : 0} done={state.derived.isFreeTrial ? [] : [3]} freeTestRun={nextTestRun(state).free} />
      ) : null}
      <PageHeader
        eyebrow="Niche setup"
        title={title}
        // The chat repeats it under "Setup agent": on a phone the conversation gets the room instead.
        description={variant === "A" ? <span className="hidden sm:inline">{DESCRIPTION}</span> : DESCRIPTION}
        actions={
          otherNiches > 0 ? (
            <ButtonLink href="/niches" variant="secondary">
              <ListChecks aria-hidden />
              All Niches
            </ButtonLink>
          ) : null
        }
      />
      {variant === "A" ? (
        <SetupChat state={state} niche={niche} ensureNiche={ensureNiche} onStartNew={startNew} />
      ) : (
        <SetupWizard state={state} niche={niche} ensureNiche={ensureNiche} onStartNew={startNew} />
      )}
      {switcher}
    </PageContainer>
  );
}
