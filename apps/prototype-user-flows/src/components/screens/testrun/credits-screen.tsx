"use client";

// /credits: balance, Credit packs with a simulated checkout (VAT line), auto top-up, the
// placeholder price list, the ledger grouped by day and reason, and invoices.

import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Lock, Receipt, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { BackendErrorState } from "@/components/ui/backend-error-state";
import { PriceHint } from "@/components/ui/price-hint";
import { Select } from "@/components/ui/select";
import { SignedOutState } from "@/components/ui/signed-out-state";
import { diffDays } from "@/lib/dates";
import { formatCredits, formatCreditsLabel, formatDate, formatEuros, formatInvoiceNumber, formatNumber } from "@/lib/format";
import { CREDIT_PACKS, CREDIT_REASON_LABELS, packPrice, PRICE_LIST, revealCost, revealedPeopleText } from "@/lib/pricing";
import type { ClientState, CreditPackSize, CreditReason, Invoice } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { useAction } from "./use-action";
import { CheckoutModal, type PurchaseOutcome } from "./checkout-modal";
import { CreditLedger } from "./credit-ledger";
import { isFreeTrial, pendingPreviews, spentWithin } from "./model";
import { Badge, Button, ButtonLink, buttonClass, Callout, Card, CardHeader, cx, ErrorText, SectionHeader, Skeleton, Switch } from "./ui";

const LOW_BALANCE = 200;
const POPULAR_PACK: CreditPackSize = 2000;

function returnLabelFor(returnTo: string | null): string {
  if (!returnTo) return "Back";
  if (/^\/niches\/[^/]+\/test-run/.test(returnTo)) return "Back to the Test Run";
  if (returnTo.startsWith("/feed")) return "Back to the Feed";
  if (returnTo.startsWith("/campaigns")) return "Back to Campaigns";
  if (returnTo.startsWith("/niches")) return "Back to the Niche";
  return "Back";
}

export function CreditsScreen({ returnTo }: { returnTo: string | null }) {
  const state = useAppState();
  const backendError = useBackendError();
  const [checkoutPack, setCheckoutPack] = useState<CreditPackSize | null>(null);
  const [lastPurchase, setLastPurchase] = useState<PurchaseOutcome | null>(null);

  if (!state) return backendError ? <BackendErrorState error={backendError} /> : <LoadingView />;
  const ws = state.workspace;
  if (!state.session.signedIn || !ws) {
    return (
      <PageContainer className="@container">
        <PageHeader title="Credits" />
        <SignedOutState what="get a Workspace, a free Test Run and Credits" />
      </PageContainer>
    );
  }

  const freeTrial = isFreeTrial(state);
  const previews = pendingPreviews(state);
  const returnLabel = returnLabelFor(returnTo);

  return (
    <PageContainer className="@container">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Credits</span>
            {freeTrial ? <Badge tone="amber">Free trial</Badge> : <Badge tone="green">Paid</Badge>}
          </span>
        }
        description="Your Workspace prepays Credits and spends them per outcome, such as a Surfaced Prospect, a verified email or a sent email."
        actions={
          returnTo ? (
            <ButtonLink href={returnTo} icon={ArrowLeft}>
              {returnLabel}
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="space-y-8">
        {lastPurchase ? (
          <Callout
            tone="green"
            icon={Receipt}
            title={`${formatNumber(lastPurchase.invoice.credits)} Credits added`}
            actions={
              returnTo ? (
                <ButtonLink href={returnTo} variant="primary" icon={ArrowLeft}>
                  {returnLabel}
                </ButtonLink>
              ) : (
                <ButtonLink href="/feed" trailingIcon={ArrowRight}>
                  Open the Feed
                </ButtonLink>
              )
            }
          >
            Invoice {formatInvoiceNumber(lastPurchase.invoice)}: {formatEuros(lastPurchase.invoice.totalEur, true)} incl. VAT.
            {lastPurchase.revealed.hiringContacts + lastPurchase.revealed.candidates > 0 &&
              ` ${revealedPeopleText(lastPurchase.revealed)} revealed for ${formatCreditsLabel(lastPurchase.revealed.credits)}, taken from this pack.`}
            {lastPurchase.firstPack && " The free trial has ended: the agents can now be switched on from each Niche."}
          </Callout>
        ) : (
          freeTrial && (
            <Callout
              tone="indigo"
              icon={Lock}
              title="Buy Credits to reveal people and switch agents on"
              actions={
                <a href="#packs" className={buttonClass("primary")}>
                  Choose a pack
                  <ArrowRight className="size-4" aria-hidden />
                </a>
              }
            >
              {previews.hiringContacts + previews.candidates > 0 ? (
                <>
                  Your Test Run found {revealedPeopleText(previews)}, shown as Previews. Your first pack reveals who they are for{" "}
                  {formatCreditsLabel(revealCost(previews))} <PriceHint />, taken from the pack at the normal price, and unlocks Enrichment, Campaigns and daily agent runs.
                </>
              ) : (
                "Your first pack unlocks people, Enrichment, Campaigns and daily agent runs. In the free trial, Hiring Contacts and Candidates are only Previews."
              )}
            </Callout>
          )
        )}

        <div className="grid gap-4 @3xl:grid-cols-3">
          <BalanceCard state={state} />
          <AutoTopUpCard state={state} />
          <SpendCard state={state} />
        </div>

        <section>
          <SectionHeader
            id="packs"
            title={
              <>
                Buy Credits <PriceHint />
              </>
            }
            description="Prices excl. VAT. Credits are spent per outcome, at the prices of the list below."
          />
          <div className="grid gap-4 @2xl:grid-cols-3">
            {CREDIT_PACKS.map((p) => {
              const popular = p.credits === POPULAR_PACK;
              return (
                <div key={p.credits} className={cx("relative flex flex-col rounded-lg border bg-white p-4 shadow-xs", popular ? "border-indigo-300 ring-1 ring-indigo-200" : "border-zinc-200")}>
                  <div className="flex h-5 items-center justify-between gap-2">
                    <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{p.label}</p>
                    {popular && <Badge tone="indigo">Most chosen</Badge>}
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
                    {formatNumber(p.credits)} <span className="text-sm font-normal text-zinc-500">Credits</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">
                    <span className="font-medium tabular-nums">{formatEuros(p.priceEur)}</span> <span className="text-zinc-500">excl. VAT</span>
                    <span className="text-zinc-400"> · </span>
                    <span className="text-zinc-500 tabular-nums">€{p.perCreditEur.toFixed(3)} per Credit</span>
                  </p>
                  <ul className="mt-3 mb-4 space-y-1 text-xs text-zinc-500">
                    <li>About {formatNumber(p.credits)} Surfaced Prospects or Candidates</li>
                    <li>or {formatNumber(Math.floor(p.credits / 2))} verified emails</li>
                  </ul>
                  <Button variant={popular ? "primary" : "secondary"} className="mt-auto w-full" onClick={() => setCheckoutPack(p.credits)}>
                    Buy {formatNumber(p.credits)} Credits
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <CreditLedger entries={state.creditLedger} niches={state.niches} today={state.clock.today} />
          </div>
          <div className="space-y-4">
            <PriceListCard />
            <InvoicesCard invoices={state.invoices} workspaceName={ws.name} />
          </div>
        </div>
      </div>

      <CheckoutModal
        key={checkoutPack ?? "closed"}
        state={state}
        pack={checkoutPack}
        onClose={() => setCheckoutPack(null)}
        onPurchased={setLastPurchase}
        returnTo={returnTo}
        returnLabel={returnLabel}
        previewsToReveal={previews}
      />
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Balance, auto top-up, spend                                         */
/* ------------------------------------------------------------------ */

function BalanceCard({ state }: { state: ClientState }) {
  const ws = state.workspace;
  if (!ws) return null;
  const today = state.clock.today;
  const spentToday = spentWithin(state.creditLedger, today, 1);
  const spent7 = spentWithin(state.creditLedger, today, 7);
  const spent30 = spentWithin(state.creditLedger, today, 30);
  const daily = spentWithin(state.creditLedger, today, 14) / 14;
  const runway = daily > 0 ? Math.floor(ws.credits / daily) : null;
  const low = ws.plan === "paid" && !ws.autoTopUp.enabled && ws.credits < LOW_BALANCE;
  return (
    <Card>
      <div className="px-4 py-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <Wallet className="size-3.5 text-zinc-400" aria-hidden />
          Balance
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums">
          {formatCredits(ws.credits)} <span className="text-sm font-normal tracking-normal text-zinc-500">{ws.credits === 1 ? "Credit" : "Credits"}</span>
        </p>
        <dl className="mt-3 divide-y divide-zinc-100 text-xs">
          <div className="flex justify-between gap-2 py-1.5">
            <dt className="text-zinc-500">Spent today</dt>
            <dd className="font-medium text-zinc-900 tabular-nums">{formatCredits(spentToday)}</dd>
          </div>
          <div className="flex justify-between gap-2 py-1.5">
            <dt className="text-zinc-500">Last 7 days</dt>
            <dd className="font-medium text-zinc-900 tabular-nums">{formatCredits(spent7)}</dd>
          </div>
          <div className="flex justify-between gap-2 py-1.5">
            <dt className="text-zinc-500">Last 30 days</dt>
            <dd className="font-medium text-zinc-900 tabular-nums">{formatCredits(spent30)}</dd>
          </div>
        </dl>
        {low ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Low balance: agents stop cleanly when Credits run out. Buy a pack or switch on auto top-up.
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            {runway !== null ? `About ${formatNumber(runway)} days left at the pace of the last 14 days.` : "No spending in the last 14 days."}
          </p>
        )}
      </div>
    </Card>
  );
}

function AutoTopUpCard({ state }: { state: ClientState }) {
  const { run, pending, error, clearError } = useAction();
  const thresholdId = useId();
  const packId = useId();
  const ws = state.workspace;
  if (!ws) return null;
  const at = ws.autoTopUp;
  const price = packPrice(at.packCredits);
  const freeTrial = ws.plan !== "paid";

  const commitThreshold = (raw: string) => {
    const value = Math.max(0, Math.round(Number(raw)));
    if (!Number.isFinite(value) || value === at.thresholdCredits) return;
    void run("setAutoTopUp", { enabled: at.enabled, thresholdCredits: value }, "threshold");
  };

  return (
    <Card>
      <CardHeader
        icon={RefreshCw}
        title="Auto top-up"
        description="Agents and Campaigns never stop for lack of Credits."
        actions={<Switch label="Auto top-up" checked={at.enabled} disabled={pending !== null} onChange={(enabled) => void run("setAutoTopUp", { enabled }, "toggle")} />}
      />
      <div className="space-y-3 px-4 py-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
          <label htmlFor={thresholdId} className="text-zinc-600">
            Top up below
          </label>
          <div className="flex items-center gap-2">
            <input
              id={thresholdId}
              key={at.thresholdCredits}
              type="number"
              min={0}
              step={50}
              defaultValue={at.thresholdCredits}
              onBlur={(e) => commitThreshold(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="h-8 w-24 rounded-md border border-zinc-300 bg-white px-2.5 text-right text-sm text-zinc-900 tabular-nums shadow-xs hover:border-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
            <span className="text-zinc-600">Credits</span>
          </div>
          <label htmlFor={packId} className="text-zinc-600">
            Buy
          </label>
          <Select
            id={packId}
            value={at.packCredits}
            onChange={(e) => void run("setAutoTopUp", { enabled: at.enabled, packCredits: Number(e.target.value) as CreditPackSize }, "pack")}
            className="w-full min-w-0"
          >
            {CREDIT_PACKS.map((p) => (
              <option key={p.credits} value={p.credits}>
                {formatNumber(p.credits)} Credits
              </option>
            ))}
          </Select>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          Each top-up: {formatEuros(price.totalEur, true)} incl. VAT <PriceHint />
        </p>
        <p className={cx("flex items-start gap-2 text-xs", at.enabled ? "text-emerald-700" : "text-zinc-500")}>
          <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", at.enabled ? "bg-emerald-500" : "bg-zinc-400")} aria-hidden />
          {at.enabled ? "On" : "Off: agents stop cleanly and Campaigns stop sending when Credits run out."}
        </p>
        {freeTrial && <p className="text-xs text-zinc-500">Takes effect after your first pack.</p>}
        {error && <ErrorText onDismiss={clearError}>{error}</ErrorText>}
      </div>
    </Card>
  );
}

function SpendCard({ state }: { state: ClientState }) {
  const today = state.clock.today;
  const totals = new Map<CreditReason, number>();
  for (const e of state.creditLedger) {
    const age = diffDays(today, e.on);
    if (e.delta >= 0 || age < 0 || age >= 30) continue;
    totals.set(e.reason, (totals.get(e.reason) ?? 0) - e.delta);
  }
  const rows = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const max = rows[0]?.[1] ?? 0;
  return (
    <Card>
      <CardHeader title="Spent in the last 30 days" description={`${formatCredits(total)} Credits, by reason`} />
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500">Nothing spent in the last 30 days.</p>
      ) : (
        <ul className="space-y-2.5 px-4 py-3">
          {rows.map(([reason, value]) => (
            <li key={reason} title={`${CREDIT_REASON_LABELS[reason]}: ${formatCredits(value)} Credits (${Math.round((value / total) * 100)}%)`}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-zinc-600">{CREDIT_REASON_LABELS[reason]}</span>
                <span className="shrink-0 font-medium text-zinc-900 tabular-nums">{formatCredits(value)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Price list and invoices                                             */
/* ------------------------------------------------------------------ */

function PriceListCard() {
  return (
    <div id="prices" className="scroll-mt-6">
      <Card>
        <CardHeader title="Price list" description="Credits per outcome" actions={<PriceHint />} />
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            {PRICE_LIST.map((p) => (
              <tr key={p.key}>
                <td className="px-4 py-2">
                  <span className="block text-zinc-900">{p.label}</span>
                  <span className="block text-xs text-zinc-500">{p.unit}</span>
                </td>
                <td className="px-4 py-2 text-right align-top font-medium whitespace-nowrap text-zinc-900 tabular-nums">
                  {p.credits === 0 ? "Free" : `${p.credits} ${p.credits === 1 ? "Credit" : "Credits"}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
          Enrichment is charged only for values found. Mobile numbers are ticked per person, never by default. Revealing the free trial&apos;s Previews on the first pack is
          charged per Hiring Contact found and per Surfaced Candidate. Every Credit-spending action shows its cost before you confirm.
        </p>
      </Card>
    </div>
  );
}

function downloadInvoice(invoice: Invoice, workspaceName: string) {
  const lines = [
    `Invoice ${formatInvoiceNumber(invoice)} (simulated, prototype)`,
    `Date: ${formatDate(invoice.on)}`,
    `Billed to: ${workspaceName}`,
    "",
    `${formatNumber(invoice.credits)} Credits`,
    `Subtotal: ${formatEuros(invoice.netEur, true)}`,
    `VAT (${Math.round(invoice.vatRate * 100)}%): ${formatEuros(invoice.vatEur, true)}`,
    `Total: ${formatEuros(invoice.totalEur, true)}`,
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${formatInvoiceNumber(invoice)}.txt`;
  // Attached while clicked (some browsers ignore a click on a detached anchor), and the URL is
  // revoked only once the browser has started the download.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function InvoicesCard({ invoices, workspaceName }: { invoices: Invoice[]; workspaceName: string }) {
  const sorted = [...invoices].sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  return (
    <Card>
      <CardHeader icon={Receipt} title="Invoices" />
      {sorted.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500">No invoice yet. Each pack and auto top-up adds one here.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {sorted.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 tabular-nums">{formatNumber(inv.credits)} Credits</p>
                <p className="truncate text-xs text-zinc-500">
                  {formatDate(inv.on)} · {formatInvoiceNumber(inv)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm text-zinc-900 tabular-nums">{formatEuros(inv.totalEur, true)}</p>
                <p className="text-xs text-zinc-500 tabular-nums">VAT {formatEuros(inv.vatEur, true)}</p>
              </div>
              <button
                type="button"
                onClick={() => downloadInvoice(inv, workspaceName)}
                className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={`Download invoice ${formatInvoiceNumber(inv)}`}
                title="Download"
              >
                <Download className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

function LoadingView() {
  return (
    <PageContainer className="@container">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-8">
        <div className="grid gap-4 @3xl:grid-cols-3">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
        <div className="grid gap-4 @2xl:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    </PageContainer>
  );
}
