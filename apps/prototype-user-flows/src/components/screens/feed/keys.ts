// Keyboard helpers shared by the Feed shortcuts (Split and Triage variants, Escape to clear the selection).

const MODAL_FLAG = "feedModal";

export function setModalOpen(open: boolean): void {
  if (open) document.body.dataset[MODAL_FLAG] = "open";
  else delete document.body.dataset[MODAL_FLAG];
}

export function isModalOpen(): boolean {
  return document.body.dataset[MODAL_FLAG] === "open" || document.querySelector('[aria-modal="true"]') !== null;
}

/** True when a global shortcut must not fire: typing in a field, a modifier held, or a dialog open. */
export function shouldIgnoreShortcut(e: KeyboardEvent, opts: { allowShift?: boolean } = {}): boolean {
  if (e.defaultPrevented || e.isComposing) return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  if (e.shiftKey && !opts.allowShift) return true;
  const el = e.target instanceof HTMLElement ? e.target : null;
  if (el) {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
  }
  return isModalOpen();
}
