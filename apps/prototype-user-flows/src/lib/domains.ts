// Main Domain rules (ADR-0017): Campaign emails are never sent from a Main Domain or any subdomain of it.
// Free Test Runs are limited to work accounts (ADR-0018): consumer mailbox domains are never a Main Domain.

/** True when `domain` is one of `mainDomains` or a subdomain of one (case-insensitive). */
export function isOnMainDomain(domain: string, mainDomains: string[]): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  return mainDomains.some((raw) => {
    const main = raw.trim().toLowerCase();
    return main.length > 0 && (d === main || d.endsWith(`.${main}`));
  });
}

/** Consumer mailbox providers: a personal account, never a company's domain. */
export const PERSONAL_EMAIL_PROVIDERS: readonly string[] = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "orange.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "wanadoo.fr",
  "gmx.fr",
  "gmx.de",
  "web.de",
  // The fictional providers the prototype's people use.
  "nuvomail.fr",
  "postelle.eu",
  "mailbloc.com",
  "kourriel.fr",
];

/** True when `domain` belongs to a consumer mailbox provider (case-insensitive). */
export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_PROVIDERS.includes(domain.trim().toLowerCase());
}
