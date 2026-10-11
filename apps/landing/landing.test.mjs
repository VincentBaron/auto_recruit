import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dir = fileURLToPath(new URL(".", import.meta.url));
const read = (name) => readFileSync(join(dir, name), "utf8");
const pages = ["index.html", "confidentialite.html", "conditions.html"];

test("the three pages exist and are in French, phone-first, light and dark", () => {
  for (const page of pages) {
    assert.ok(existsSync(join(dir, page)), `${page} is missing`);
    const html = read(page);
    assert.match(html, /<html lang="fr"/, `${page} is not lang=fr`);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(html, /<meta name="color-scheme" content="light dark"/);
  }
  assert.match(read("style.css"), /prefers-color-scheme:\s*dark/);
});

test("the single button opens the bot in Telegram with no start code", () => {
  const html = read("index.html");
  const links = [...html.matchAll(/<a [^>]*href="(https:\/\/t\.me\/[^"]*)"/g)].map((m) => m[1]);
  assert.equal(links.length, 1, "exactly one Telegram button");
  assert.match(links[0], /^https:\/\/t\.me\/[A-Za-z0-9_]+$/);
  assert.match(html, /Démarrer sur Telegram/);
});

test("the landing page carries the headline, the example tasks and the footer links", () => {
  const html = read("index.html");
  assert.match(html, /Auto Recruit trouve qui appeler\. Vous appelez\./);
  assert.equal([...html.matchAll(/<li>/g)].length, 5, "five example tasks");
  assert.equal([...html.matchAll(/<svg/g)].length, 5, "one line doodle per task");
  assert.ok(!/<img/.test(html), "no screenshots");
  assert.match(html, /href="confidentialite\.html"/);
  assert.match(html, /href="conditions\.html"/);
  assert.match(html, /href="mailto:[^"]+"/);
  assert.match(html, /© 2026/);
});

test("the privacy and terms pages say we process Desks on behalf of each Recruiter", () => {
  for (const page of ["confidentialite.html", "conditions.html"]) {
    const html = read(page);
    assert.match(html, /sous-traitant/, `${page}: processor role`);
    assert.match(html, /responsable de traitement/, `${page}: controller role`);
    assert.match(html, /Desk/, `${page}: Desk`);
  }
  const privacy = read("confidentialite.html");
  for (const sub of ["Exa", "Mistral", "Anthropic"]) assert.match(privacy, new RegExp(sub));
  assert.match(privacy, /30 jours/);
  assert.match(privacy, /France/);
});

test("every local link resolves", () => {
  for (const page of pages) {
    for (const [, href] of read(page).matchAll(/href="([^"#:]+\.(?:html|css))"/g)) {
      assert.ok(existsSync(join(dir, href)), `${page} links to missing ${href}`);
    }
  }
});
