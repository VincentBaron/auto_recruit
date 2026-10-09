"use client";

import { createContext, useContext } from "react";
import type { ActionName, ActionPayload, ActionResult, FeedItemRef, PersonRef } from "@/lib/types";
import type { FeedModel } from "./model";

export interface EnrichChoice {
  ref: PersonRef;
  /** Pre-ticked in the dialog (the Recruiter still confirms). */
  selected?: boolean;
  /** Mobile is never ticked by default; only the Triage marks pass a Recruiter's own choice. */
  mobile?: boolean;
}

export interface EnrichGroup {
  /** Prospect name for Hiring Contacts; null for a flat list of Candidates. */
  title: string | null;
  subtitle?: string | null;
  people: EnrichChoice[];
}

export interface EnrichRequest {
  groups: EnrichGroup[];
  onDone?: () => void;
}

export interface ToastInput {
  tone?: "success" | "info" | "danger";
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  link?: { label: string; href: string };
}

export interface FeedApi {
  model: FeedModel;
  /** Runs an action; shows an error toast and returns null on failure. */
  run<K extends ActionName>(name: K, payload: ActionPayload<K>): Promise<ActionResult<K> | null>;
  notify(t: ToastInput): void;
  openEnrich(req: EnrichRequest): void;
  openDismiss(items: FeedItemRef[], onDone?: () => void): void;
  openAddToCampaign(people: PersonRef[]): void;
  restore(items: FeedItemRef[]): Promise<void>;
  markSeen(prospectId: string): void;
}

export const FeedContext = createContext<FeedApi | null>(null);

export function useFeed(): FeedApi {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside <FeedContext.Provider>");
  return ctx;
}
