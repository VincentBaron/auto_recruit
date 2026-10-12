import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zipDesk } from "../src/zip.ts";

/** A minimal reader of the central directory, so the test checks the archive and not our writer. */
function unzip(zip: Buffer): Map<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localName = zip.readUInt16LE(local + 26);
    const localExtra = zip.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    const raw = zip.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    expect(crc32(data)).toBe(crc);
    out.set(name, data.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

describe("zipDesk", () => {
  it("CH-12.S3 packs every markdown file of the Desk with its path and its exact content", () => {
    const desk = mkdtempSync(join(tmpdir(), "zip-"));
    mkdirSync(join(desk, "prospects"));
    mkdirSync(join(desk, ".git"));
    writeFileSync(join(desk, "CALL_LIST.md"), "# Call List\n\nLéa Morel - rappel 10h\n");
    writeFileSync(join(desk, "prospects", "acme-com.md"), "# Acme\n".repeat(500));
    writeFileSync(join(desk, ".git", "config.md"), "never");
    writeFileSync(join(desk, "sessions.json"), "{}");
    const files = unzip(zipDesk(desk));
    expect([...files.keys()].sort()).toEqual(["CALL_LIST.md", "prospects/acme-com.md"]);
    expect(files.get("CALL_LIST.md")).toBe("# Call List\n\nLéa Morel - rappel 10h\n");
    expect(files.get("prospects/acme-com.md")).toBe("# Acme\n".repeat(500));
  });

  it("CH-12.S3 makes a valid empty archive for an empty Desk", () => {
    expect(unzip(zipDesk(mkdtempSync(join(tmpdir(), "zip-")))).size).toBe(0);
  });
});
