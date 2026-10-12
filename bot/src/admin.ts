export type AdminCommand =
  | { kind: "invite"; name: string }
  | { kind: "raise-batches"; name: string; batches: number }
  | { kind: "add-euros"; name: string; euros: number }
  | { kind: "end-partnership"; name: string };

const AMOUNT = String.raw`(\d+(?:[.,]\d+)?)`;
const ADD_EUROS = new RegExp(
  String.raw`^give (.+?) (?:€ ?${AMOUNT}|${AMOUNT} ?(?:€|eur|euros)) more(?: for (?:phone )?numbers)?$`,
  "i",
);

/** Reads one of Vincent's admin lines: "invite Camille Dupont", "raise Camille to 6 Batches", "give Camille €30 more for numbers". */
export function parseAdminCommand(text: string): AdminCommand | null {
  const line = text.trim().replace(/\s+/g, " ");
  const invite = /^invite (.+)$/i.exec(line);
  if (invite) return { kind: "invite", name: invite[1] };
  const raise = /^raise (.+?) to (\d+) batch(?:es)?$/i.exec(line);
  if (raise) return { kind: "raise-batches", name: raise[1], batches: Number(raise[2]) };
  const give = ADD_EUROS.exec(line);
  if (give) return { kind: "add-euros", name: give[1], euros: Number((give[2] ?? give[3]).replace(",", ".")) };
  return null;
}
