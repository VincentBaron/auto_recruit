/** The name in a Recruiter's erasure request ("Efface Sophie Leroy", "forget Sophie Leroy"), or null when the line is not one. */
export function parseErasure(_text: string): string | null {
  return null;
}

/**
 * Erases a person from a Desk: their files, their sections and lines everywhere, keeping one line in `DO_NOT_CALL.md`.
 * `today` is `YYYY-MM-DD`. Returns false, changing nothing, when the Desk has nobody of that name.
 */
export function eraseFromDesk(_desk: string, _name: string, _today: string): boolean {
  return false;
}
