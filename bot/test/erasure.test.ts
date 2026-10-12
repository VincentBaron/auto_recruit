import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eraseFromDesk, parseErasure } from "../src/erasure.ts";

let desk: string;

const sophie = (name = "Sophie Leroy") =>
  `# ${name}\n\n- LinkedIn: https://www.linkedin.com/in/sophieleroy\n- Phone: +33611223344 (Exa, 2026-10-12)\n\n## Attempts\n\n- 2026-10-13 10:20 - Voicemail\n`;

const files = () => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(path.slice(desk.length + 1));
    }
  };
  walk(desk);
  return out;
};
const read = (path: string) => readFileSync(join(desk, path), "utf8");

beforeEach(() => {
  desk = mkdtempSync(join(tmpdir(), "erase-"));
  for (const dir of ["candidates", "prospects", "batches"]) mkdirSync(join(desk, dir));
  writeFileSync(join(desk, "candidates", "sophie-leroy.md"), sophie());
  writeFileSync(join(desk, "candidates", "hugo-martin.md"), "# Hugo Martin\n\n- LinkedIn: https://www.linkedin.com/in/hugomartin\n");
  writeFileSync(
    join(desk, "prospects", "acme-com.md"),
    [
      "# Acme",
      "",
      "acme.com - AI infrastructure - Niche: fde",
      "Parked until 2026-04-14 (Not Interested from Sophie Leroy)",
      "",
      "## Hiring Contacts",
      "",
      "### Sophie Leroy - CTO",
      "",
      "- LinkedIn: https://www.linkedin.com/in/sophieleroy",
      "- Phone: +33611223344 (Exa, 2026-10-12)",
      "",
      "#### Attempts",
      "",
      "- 2026-10-12 11:05 - No Answer",
      "",
      "### Léa Morel - Head of Talent",
      "",
      "- LinkedIn: https://www.linkedin.com/in/leamorel",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(desk, "CALL_LIST.md"),
    [
      "# Call List",
      "",
      "| # | Who | Prospect | Due | Why Now |",
      "|---|---|---|---|---|",
      "| 1 | Sophie Leroy, CTO | [Acme](prospects/acme-com.md) | 2026-10-13 am | Callback |",
      "| 2 | Léa Morel, Head of Talent | [Acme](prospects/acme-com.md) | 2026-10-14 am | Posted roles |",
      "",
    ].join("\n"),
  );
  writeFileSync(join(desk, "SKIPPED.md"), "# Skipped\n\n- 2026-10-12 - Sophie Leroy - https://www.linkedin.com/in/sophieleroy - fde - too senior\n- 2026-10-12 - Marc Dupuis - https://www.linkedin.com/in/marcdupuis - fde - too junior\n");
  writeFileSync(
    join(desk, "batches", "fde.md"),
    "# Batch - fde\n\nStatus: Proposed\n\n## Hiring Contacts\n\n### 1. Sophie Leroy, CTO at Acme (Paris)\n\n- LinkedIn: https://www.linkedin.com/in/sophieleroy\n- Decision: Surfaced\n\n### 2. Léa Morel, Head of Talent at Acme\n\n- Decision: Surfaced\n",
  );
  writeFileSync(join(desk, "DO_NOT_CALL.md"), "# Do Not Call\n\n- 2026-10-01 - Prospect nexo.io - asked that nobody is called\n");
});

describe("parseErasure", () => {
  it("CH-12.S2 reads an erasure request in French and in English", () => {
    expect(parseErasure("Efface Sophie Leroy")).toBe("Sophie Leroy");
    expect(parseErasure("  efface Sophie Leroy. ")).toBe("Sophie Leroy");
    expect(parseErasure("Supprime Sophie Leroy de mon Desk")).toBe("Sophie Leroy");
    expect(parseErasure("Oublie Sophie Leroy")).toBe("Sophie Leroy");
    expect(parseErasure("Erase Sophie Leroy")).toBe("Sophie Leroy");
    expect(parseErasure("please forget Sophie Leroy")).toBe("Sophie Leroy");
    expect(parseErasure("Efface Jean-Pierre de la Fontaine")).toBe("Jean-Pierre de la Fontaine");
    expect(parseErasure("Efface Léa Morel")).toBe("Léa Morel");
  });

  it("CH-12.S2 leaves everything else to the agent", () => {
    for (const text of ["Remove Acme", "delete the niche", "Efface", "efface ça", "Oublie ça, on continue", "Qui est Sophie Leroy?", "forget it", "erase all the people from yesterday"]) {
      expect(parseErasure(text), text).toBeNull();
    }
  });
});

describe("eraseFromDesk", () => {
  it("CH-12.S2 leaves the person's name only in DO_NOT_CALL.md", () => {
    expect(eraseFromDesk(desk, "Sophie Leroy", "2026-10-14")).toBe(true);
    for (const path of files()) {
      const content = read(path);
      if (path === "DO_NOT_CALL.md") continue;
      expect(`${path}\n${content}`, path).not.toMatch(/sophie|leroy/i);
    }
    expect(read("DO_NOT_CALL.md")).toContain("Sophie Leroy");
  });

  it("CH-12.S2 keeps in DO_NOT_CALL.md only the date, the name and the LinkedIn URL, and no phone number", () => {
    eraseFromDesk(desk, "Sophie Leroy", "2026-10-14");
    const dnc = read("DO_NOT_CALL.md");
    expect(dnc).toContain("- 2026-10-14 - Sophie Leroy - https://www.linkedin.com/in/sophieleroy - ");
    expect(dnc).toContain("Prospect nexo.io");
    expect(dnc).not.toContain("+33611223344");
    expect(dnc.match(/Sophie Leroy/g)).toHaveLength(1);
    expect(dnc.split("\n").filter((l) => l.includes("Sophie"))[0]).not.toMatch(/Voicemail|CTO|Attempts/);
  });

  it("CH-12.S2 leaves the other people, the company and the rest of the files untouched", () => {
    eraseFromDesk(desk, "Sophie Leroy", "2026-10-14");
    expect(existsSync(join(desk, "candidates", "sophie-leroy.md"))).toBe(false);
    expect(read("candidates/hugo-martin.md")).toContain("Hugo Martin");
    const prospect = read("prospects/acme-com.md");
    expect(prospect).toContain("# Acme");
    expect(prospect).toContain("### Léa Morel - Head of Talent");
    expect(prospect).toContain("https://www.linkedin.com/in/leamorel");
    expect(prospect).toMatch(/Parked until 2026-04-14/);
    expect(read("CALL_LIST.md")).toContain("Léa Morel");
    expect(read("SKIPPED.md")).toContain("Marc Dupuis");
    expect(read("batches/fde.md")).toContain("### 2. Léa Morel");
  });

  it("CH-12.S2 finds the person whatever the case or the accents of the request", () => {
    mkdirSync(join(desk, "candidates"), { recursive: true });
    expect(eraseFromDesk(desk, "lea MOREL", "2026-10-14")).toBe(true);
    expect(read("prospects/acme-com.md")).not.toMatch(/morel/i);
    expect(read("DO_NOT_CALL.md")).toContain("- 2026-10-14 - Léa Morel - https://www.linkedin.com/in/leamorel - ");
  });

  it("CH-12.S2 changes nothing for a name the Desk does not hold, not even DO_NOT_CALL.md", () => {
    const before = files().map((p) => [p, read(p)]);
    expect(eraseFromDesk(desk, "Paul Inconnu", "2026-10-14")).toBe(false);
    expect(files().map((p) => [p, read(p)])).toEqual(before);
  });

  it("CH-12.S2 does nothing the second time and never lists the person twice", () => {
    eraseFromDesk(desk, "Sophie Leroy", "2026-10-14");
    expect(eraseFromDesk(desk, "Sophie Leroy", "2026-10-15")).toBe(false);
    expect(read("DO_NOT_CALL.md").match(/Sophie Leroy/g)).toHaveLength(1);
  });

  it("CH-12.S2 creates DO_NOT_CALL.md when the Desk has none", () => {
    writeFileSync(join(desk, "DO_NOT_CALL.md"), "");
    expect(existsSync(join(desk, "DO_NOT_CALL.md"))).toBe(true);
    eraseFromDesk(desk, "Sophie Leroy", "2026-10-14");
    expect(read("DO_NOT_CALL.md")).toMatch(/^# Do Not Call\n\n- 2026-10-14 - Sophie Leroy - /);
  });
});
