import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomic } from "./json-file.ts";

/** A start code: 1 to 64 characters of letters, digits, `_` and `-`, the only ones Telegram passes on. */
export const INVITE_CODE = /^[A-Za-z0-9_-]{1,64}$/;

interface Invite {
  /** The name Vincent gave when inviting. */
  name: string;
  /** The user id that opened the link; the code is dead once set. */
  usedBy?: string;
}

export interface Invites {
  /** A new single-use code for a Recruiter to be. */
  create(name: string): string;
  /** Spends the code: returns the invited name once, then undefined for ever. */
  redeem(code: string, userId: string): string | undefined;
}

export function loadInvites(file: string): Invites {
  const read = (): Record<string, Invite> => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  const write = (invites: Record<string, Invite>) => writeJsonAtomic(file, invites);
  // Both methods are synchronous from read to write, so two redemptions of one code can never interleave.
  return {
    create(name) {
      const invites = read();
      const code = randomBytes(12).toString("base64url");
      invites[code] = { name };
      write(invites);
      return code;
    },
    redeem(code, userId) {
      if (!INVITE_CODE.test(code)) return undefined;
      const invites = read();
      const invite = Object.hasOwn(invites, code) ? invites[code] : undefined;
      if (invite === undefined || invite.usedBy !== undefined) return undefined;
      invite.usedBy = userId;
      write(invites);
      return invite.name;
    },
  };
}
