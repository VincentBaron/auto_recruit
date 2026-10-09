"use client";

// Guards for screens holding unsaved input: a browser prompt before a reload or closing the tab, and
// in-app link clicks handed to the screen (which asks "Discard unsaved changes?") instead of navigating.

import { useEffect, useRef } from "react";

/** While `active`, the browser asks before a reload, a tab close or leaving the app. */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older Chromium versions only prompt when returnValue is set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

/**
 * While `active`, a plain click on a link to another page of the app is cancelled and its target is
 * passed to `onIntercept`. The capture-phase listener runs before React's handlers; Next.js links skip
 * navigating when the click's default was prevented, and other click handlers still run.
 */
export function useLinkInterceptor(active: boolean, onIntercept: (href: string) => void): void {
  const callback = useRef(onIntercept);
  useEffect(() => {
    callback.current = onIntercept;
  });
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Leaving the app is covered by the beforeunload prompt; a hash on the same page is not leaving.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      callback.current(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);
}
