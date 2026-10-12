import { describe, expect, it } from "vitest";
import { mdEscape, toPlainText, toTelegramHtml } from "../src/format.ts";

describe("toTelegramHtml", () => {
  it("links names, bolds, italicises and quotes", () => {
    const card = [
      "📞 **[Léa Morel](https://www.linkedin.com/in/leamorel)** - CTO, Acme",
      "*Why now:* Two FDE postings.",
      "*Opener:*",
      "> Bonjour Léa,",
      "> deux minutes ?",
      "+33612345678",
    ].join("\n");
    expect(toTelegramHtml(card)).toBe(
      [
        '📞 <b><a href="https://www.linkedin.com/in/leamorel">Léa Morel</a></b> - CTO, Acme',
        "<i>Why now:</i> Two FDE postings.",
        "<i>Opener:</i>",
        "<blockquote>Bonjour Léa,\ndeux minutes ?</blockquote>",
        "+33612345678",
      ].join("\n"),
    );
  });

  it("escapes HTML and leaves unmatched markers as typed", () => {
    expect(toTelegramHtml("R&D <b>x</b> 2 * 3 [not a link]")).toBe("R&amp;D &lt;b&gt;x&lt;/b&gt; 2 * 3 [not a link]");
    expect(toTelegramHtml('[a](https://x.io/?q="1"&r=2)')).toBe('<a href="https://x.io/?q=&quot;1&quot;&amp;r=2">a</a>');
  });

  it("does not turn non-http links into anchors", () => {
    expect(toTelegramHtml("[x](javascript:alert(1))")).not.toContain("<a");
  });

  it("shows a backslashed marker as typed, so a name from a file cannot change the layout", () => {
    const name = "Ana *the* [boss] > ok";
    expect(toTelegramHtml(`**[${mdEscape(name)}](https://l.in/a)**`)).toBe('<b><a href="https://l.in/a">Ana *the* [boss] &gt; ok</a></b>');
    expect(toTelegramHtml(mdEscape("> not a quote"))).toBe("&gt; not a quote");
  });
});

describe("toPlainText", () => {
  it("keeps the words and the link, drops the markers", () => {
    expect(toPlainText("**[Léa](https://l.in/a)** *Why now:* a \\* b\n> hi")).toBe("Léa (https://l.in/a) Why now: a * b\nhi");
  });
});
