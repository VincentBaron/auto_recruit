"use client";

// Simulated card checkout for a Credit pack: order summary with the VAT line, billing details,
// card fields prefilled with a test card, then the confirmation. Nothing is charged.

import { useState, type ReactNode } from "react";
import { ArrowLeft, CircleCheck, CreditCard, ShieldCheck } from "lucide-react";
import { formatCredits, formatCreditsLabel, formatEuros, formatInvoiceNumber, formatNumber } from "@/lib/format";
import { CREDIT_PACKS, packPrice, revealCost, revealedPeopleText, VAT_RATE } from "@/lib/pricing";
import type { ClientState, CreditPackSize, Invoice, RevealOutcome } from "@/lib/types";
import { useAction } from "./use-action";
import { PriceHint } from "@/components/ui/price-hint";
import { Button, ButtonLink, Callout, ErrorText, Modal, SummaryRow } from "./ui";

export interface PurchaseOutcome {
  invoice: Invoice;
  revealed: RevealOutcome;
  firstPack: boolean;
}

const FIELD = "h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/20";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CheckoutModal({
  state,
  pack,
  onClose,
  onPurchased,
  returnTo,
  returnLabel,
  previewsToReveal,
}: {
  state: ClientState;
  pack: CreditPackSize | null;
  onClose: () => void;
  onPurchased: (outcome: PurchaseOutcome) => void;
  returnTo: string | null;
  returnLabel: string;
  previewsToReveal: { hiringContacts: number; candidates: number };
}) {
  const { run, error, clearError } = useAction();
  const [phase, setPhase] = useState<"form" | "paying" | "done">("form");
  const [withAutoTopUp, setWithAutoTopUp] = useState(false);
  const [outcome, setOutcome] = useState<PurchaseOutcome | null>(null);
  const ws = state.workspace;
  const info = CREDIT_PACKS.find((p) => p.credits === pack);
  if (!pack || !info || !ws) return null;
  const price = packPrice(pack);
  const firstPack = ws.plan !== "paid";
  const hasPreviews = previewsToReveal.hiringContacts + previewsToReveal.candidates > 0;
  const toReveal = revealCost(previewsToReveal);

  async function pay() {
    if (!pack) return;
    clearError();
    setPhase("paying");
    await wait(700);
    const r = await run("purchaseCredits", { pack });
    if (!r.ok) {
      setPhase("form");
      return;
    }
    if (withAutoTopUp) await run("setAutoTopUp", { enabled: true, packCredits: pack });
    setOutcome(r.result);
    onPurchased(r.result);
    setPhase("done");
  }

  if (phase === "done" && outcome) {
    const revealed = outcome.revealed.hiringContacts + outcome.revealed.candidates;
    return (
      <Modal
        open
        onClose={onClose}
        title="Payment accepted"
        footer={
          <>
            <Button onClick={onClose}>Done</Button>
            {returnTo && (
              <ButtonLink href={returnTo} variant="primary" icon={ArrowLeft}>
                {returnLabel}
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="flex flex-col items-center py-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200 ring-inset">
            <CircleCheck className="size-6 text-emerald-600" aria-hidden />
          </div>
          <p className="mt-3 text-base font-semibold text-zinc-900">{formatNumber(outcome.invoice.credits)} Credits added</p>
          <p className="mt-1 text-sm text-zinc-500">
            New balance: <span className="font-medium text-zinc-900 tabular-nums">{formatCredits(ws.credits)} Credits</span>
          </p>
        </div>
        <div className="mt-4 rounded-lg border border-zinc-200 px-4 py-2">
          <SummaryRow label={`Invoice ${formatInvoiceNumber(outcome.invoice)}`} value={formatEuros(outcome.invoice.totalEur, true)} />
          <SummaryRow label={`incl. VAT (${Math.round(outcome.invoice.vatRate * 100)}%)`} value={formatEuros(outcome.invoice.vatEur, true)} />
        </div>
        {revealed > 0 && (
          <div className="mt-3">
            <Callout tone="green" icon={ShieldCheck} title="People revealed">
              {revealedPeopleText(outcome.revealed)} are now stored in your Workspace, with their Provenance, for {formatCreditsLabel(outcome.revealed.credits)} taken from
              this pack. Enrichment, Campaigns and daily agent runs are now available.
            </Callout>
          </div>
        )}
      </Modal>
    );
  }

  const paying = phase === "paying";
  return (
    <Modal
      open
      onClose={paying ? () => undefined : onClose}
      size="lg"
      title="Checkout"
      description="Simulated card payment: nothing is charged in this prototype."
      footer={
        <>
          <Button onClick={onClose} disabled={paying}>
            Cancel
          </Button>
          <Button variant="primary" icon={CreditCard} loading={paying} onClick={() => void pay()}>
            {paying ? "Processing..." : `Pay ${formatEuros(price.totalEur, true)}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Order</p>
          <div className="mt-2 rounded-lg border border-zinc-200 px-4 py-2">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{info.label} pack</p>
                <p className="text-xs text-zinc-500">
                  {formatNumber(info.credits)} Credits · €{info.perCreditEur.toFixed(3)} per Credit
                </p>
              </div>
              <PriceHint />
            </div>
            <SummaryRow label="Subtotal" value={formatEuros(price.netEur, true)} />
            <SummaryRow label={`VAT (${Math.round(VAT_RATE * 100)}%)`} value={formatEuros(price.vatEur, true)} />
            <div className="border-t border-zinc-100">
              <SummaryRow strong label="Total due today" value={formatEuros(price.totalEur, true)} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Billed to</p>
            <p className="mt-2 text-sm font-medium text-zinc-900">{ws.name}</p>
            <p className="text-sm text-zinc-600">{ws.address}</p>
          </div>
          {firstPack && hasPreviews && (
            <div className="mt-4">
              <Callout tone="indigo" title="Your first pack reveals the people from your Test Run">
                <p>
                  Reveals {revealedPeopleText(previewsToReveal)} for <span className="font-medium text-zinc-900 tabular-nums">{formatCreditsLabel(toReveal)}</span>{" "}
                  <PriceHint />, taken from this pack.
                </p>
                <p className="mt-1">
                  Charged at the normal price per Hiring Contact found and per Surfaced Candidate. They are stored in your Workspace with their Provenance, and{" "}
                  {formatCreditsLabel(ws.credits + info.credits - toReveal)} remain.
                </p>
              </Callout>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Card</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Card number" className="col-span-2">
              <input className={`${FIELD} tabular-nums`} defaultValue="4242 4242 4242 4242" inputMode="numeric" autoComplete="off" disabled={paying} />
            </Field>
            <Field label="Expiry">
              <input className={`${FIELD} tabular-nums`} defaultValue="12 / 28" autoComplete="off" disabled={paying} />
            </Field>
            <Field label="CVC">
              <input className={`${FIELD} tabular-nums`} defaultValue="123" inputMode="numeric" autoComplete="off" disabled={paying} />
            </Field>
            <Field label="Name on card" className="col-span-2">
              <input className={FIELD} defaultValue={state.derived?.currentRecruiter?.name ?? ""} autoComplete="off" disabled={paying} />
            </Field>
            <Field label="VAT number (optional)" className="col-span-2">
              <input className={FIELD} placeholder="FR00 000000000" autoComplete="off" disabled={paying} />
            </Field>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
            <input type="checkbox" checked={withAutoTopUp} onChange={(e) => setWithAutoTopUp(e.target.checked)} disabled={paying} className="mt-0.5 size-4 shrink-0 accent-indigo-600" />
            <span className="text-sm text-zinc-700">
              Turn on auto top-up with this pack
              <span className="block text-xs text-zinc-500">
                Buys {formatNumber(info.credits)} Credits ({formatEuros(price.totalEur, true)} incl. VAT) when the balance falls below {formatNumber(ws.autoTopUp.thresholdCredits)} Credits.
              </span>
            </span>
          </label>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="size-3.5 text-zinc-400" aria-hidden />
            Test card prefilled. No card data leaves this page.
          </p>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorText onDismiss={clearError}>{error}</ErrorText>
        </div>
      )}
    </Modal>
  );
}
