"use client";

// Per-component pending and error state around `act` (the shared client in @/lib/api).

import { useCallback, useState } from "react";
import { act } from "@/lib/api";
import type { ActionName, ActionPayload, ActResponse } from "@/lib/types";

/** `pending` holds the key of the running action, `error` the last failure. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <K extends ActionName>(name: K, payload: ActionPayload<K>, key?: string): Promise<ActResponse<K>> => {
    setPending(key ?? name);
    setError(null);
    const response = await act(name, payload);
    setPending(null);
    if (!response.ok) setError(response.error);
    return response;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}
