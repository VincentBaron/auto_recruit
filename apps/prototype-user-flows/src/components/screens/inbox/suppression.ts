"use client";

// Whether an address (or its domain) is on the Suppression List. The list only holds sha256 hashes
// of the normalised value (trimmed, lower case), like the backend's own check, so the browser hashes
// the person's addresses with Web Crypto and compares. Hashes are cached for the session, so a reply
// opened again is checked synchronously.

import { useEffect, useState } from "react";
import type { SuppressionEntry } from "@/lib/types";

const hashes = new Map<string, string>();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Each address and its domain, normalised like the backend does before hashing. */
function valuesOf(addresses: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const address of addresses) {
    const value = address?.trim().toLowerCase();
    if (!value) continue;
    out.add(value);
    const domain = value.split("@")[1];
    if (domain) out.add(domain);
  }
  return [...out].sort();
}

/** The Suppression List entry matching one of these addresses (or their domain), or null. */
export function useSuppressionEntry(addresses: (string | null | undefined)[], list: SuppressionEntry[]): SuppressionEntry | null {
  const key = valuesOf(addresses).join("\n");
  const [, setHashed] = useState(0);

  useEffect(() => {
    const missing = key ? key.split("\n").filter((v) => !hashes.has(v)) : [];
    if (missing.length === 0 || typeof crypto === "undefined" || !crypto.subtle) return;
    let alive = true;
    void Promise.all(missing.map(async (v) => hashes.set(v, await sha256(v)))).then(() => {
      if (alive) setHashed((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!key) return null;
  for (const value of key.split("\n")) {
    const hash = hashes.get(value);
    const entry = hash ? list.find((e) => e.hash === hash) : undefined;
    if (entry) return entry;
  }
  return null;
}
