import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

/** Paths of the markdown files of a folder, relative to it; hidden folders such as `.git` are left out. */
function markdownFiles(root: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = base === "" ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory()) out.push(...markdownFiles(root, path));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(path);
  }
  return out.sort();
}

/** MS-DOS date and time fields of a zip header. */
function dosTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Every markdown file of a Desk, in one zip archive (paths relative to the Desk, `.git` left out). */
export function zipDesk(desk: string): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const path of markdownFiles(desk)) {
    const raw = readFileSync(join(desk, path));
    const data = deflateRawSync(raw);
    const name = Buffer.from(path, "utf8");
    const stamp = dosTime(statSync(join(desk, path)).mtime);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(stamp.time, 12);
    entry.writeUInt16LE(stamp.date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
