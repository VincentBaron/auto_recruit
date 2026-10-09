// The footer every email carries: sender identity, one-click opt-out, the Article 14 Notice on emails
// to Candidates, and the AI-assistance note (ADR-0002, ADR-0005). Shared by Campaigns and the Inbox.

import type { ReactNode } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { cx } from "@/components/ui/cx";
import type { EmailFooter } from "@/lib/types";

function FooterLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[136px_minmax(0,1fr)]">
      <div className="pt-px text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-indigo-500/80">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmailFooterBlock({ footer, compact = false }: { footer: EmailFooter; compact?: boolean }) {
  return (
    <footer className={cx("border-t border-dashed border-zinc-200 bg-zinc-50/70 text-xs leading-5 text-zinc-600", compact ? "space-y-2 px-3 py-2.5" : "space-y-2.5 px-4 py-3")}>
      <FooterLine label="Sender identity">
        <span className="font-medium text-zinc-700">{footer.senderName}</span>, {footer.senderTitle} - {footer.workspaceName}
        <br />
        <span className="break-words">{footer.workspaceAddress}</span>
        {footer.senderEmail ? (
          <>
            {" "}
            - <span className="inline-block max-w-full [overflow-wrap:anywhere]">{footer.senderEmail}</span>
          </>
        ) : null}
      </FooterLine>
      <FooterLine label="One-click opt-out">
        <span className="break-words text-indigo-700 underline decoration-indigo-300 underline-offset-2" title={footer.optOutUrl}>
          {footer.optOutLabel}
        </span>
      </FooterLine>
      {footer.article14Notice ? (
        <FooterLine label="Article 14 Notice">
          <span className="flex gap-1.5">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
            <span className="break-words">{footer.article14Notice}</span>
          </span>
        </FooterLine>
      ) : null}
      <FooterLine label="AI assistance">
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 shrink-0 text-indigo-500" aria-hidden />
          {footer.aiNote}
        </span>
      </FooterLine>
    </footer>
  );
}
