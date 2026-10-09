// Every action of the dummy backend, one handler per name declared in `Actions` (src/lib/types.ts).
// The type below fails to compile when an action has no handler.

import type { ActionName } from "@/lib/types";
import type { HandlerMap } from "../handler-types";
import { campaignHandlers } from "./campaigns";
import { chatHandlers } from "./chat";
import { creditHandlers } from "./credits";
import { feedHandlers } from "./feed";
import { inboxHandlers } from "./inbox";
import { mailboxHandlers } from "./mailboxes";
import { nicheHandlers } from "./niches";
import { privacyHandlers } from "./privacy";
import { sessionHandlers } from "./session";
import { teamHandlers } from "./team";

export const handlers: HandlerMap<ActionName> = {
  ...sessionHandlers,
  ...nicheHandlers,
  ...creditHandlers,
  ...feedHandlers,
  ...campaignHandlers,
  ...inboxHandlers,
  ...mailboxHandlers,
  ...teamHandlers,
  ...privacyHandlers,
  ...chatHandlers,
};

/** Actions that only compute an answer: their side effects (ids, drafts) are always rolled back. */
export const PURE_ACTIONS: ReadonlySet<ActionName> = new Set<ActionName>(["suggestNicheFields", "quoteEnrichment", "previewDrafts", "suggestLookalikeDomains"]);

export function isActionName(name: string): name is ActionName {
  return Object.prototype.hasOwnProperty.call(handlers, name);
}
