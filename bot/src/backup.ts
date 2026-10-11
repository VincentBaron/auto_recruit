import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pushDesk } from "./desk-git.ts";

/** Pushes every Desk to its own private GitHub repo; run nightly by `deploy/auto-recruit-backup.timer`. */
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.AUTO_RECRUIT_DATA ?? join(here, "..", "data"));
const entries: Array<{ desk: string }> = JSON.parse(readFileSync(join(dataDir, "recruiters.json"), "utf8"));

let failed = 0;
for (const { desk } of entries) {
  try {
    await pushDesk(desk);
    console.log(`pushed ${desk}`);
  } catch (error) {
    failed++;
    console.error(`push failed for ${desk}`, error);
  }
}
process.exitCode = failed === 0 ? 0 : 1;
