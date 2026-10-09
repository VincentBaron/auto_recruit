// App navigation: the left sidebar's items, and which routes render without the product chrome.

import type { LucideIcon } from "lucide-react";
import { Coins, Crosshair, KeyRound, LayoutList, Mail, MessageSquareReply, Newspaper, PenLine, Send, ShieldCheck, Users } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other route prefixes that highlight this item. */
  also?: string[];
  /**
   * A count next to the label: unhandled replies to the current Recruiter's Campaigns, or open Data
   * Requests due within 7 days (or overdue).
   */
  badge?: "unhandledReplies" | "dataRequestsDue";
}

export const MAIN_NAV: NavItem[] = [
  { href: "/feed", label: "Feed", icon: LayoutList, also: ["/prospects", "/candidates"] },
  { href: "/inbox", label: "Inbox", icon: MessageSquareReply, badge: "unhandledReplies" },
  { href: "/digest", label: "Digest", icon: Newspaper },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/niches", label: "Niches", icon: Crosshair, also: ["/onboarding"] },
  { href: "/credits", label: "Credits", icon: Coins },
];

export const SETTINGS_NAV: NavItem[] = [
  { href: "/settings/mailboxes", label: "Sending Mailboxes", icon: Mail },
  { href: "/settings/voice", label: "Voice Profile", icon: PenLine },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/api", label: "API & MCP", icon: KeyRound },
  { href: "/settings/privacy", label: "Data & privacy", icon: ShieldCheck, badge: "dataRequestsDue" },
];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isActive(item: NavItem, pathname: string): boolean {
  return under(pathname, item.href) || (item.also ?? []).some((p) => under(pathname, p));
}

/**
 * Routes with their own header and no sidebar, top bar or Ask panel: the landing page, sign-up, and
 * the public Consent Page shown to Candidates in the Workspace's name. Decided from the route tree's
 * first segment (null for "/"), never from the URL, so server and client always agree, including on a
 * 404 (its segment is not one of these, so it gets the product chrome).
 */
export function isBareSegment(segment: string | null): boolean {
  return segment === null || segment === "signup" || segment === "consent";
}
