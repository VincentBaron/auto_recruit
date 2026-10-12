const SECTIONS = ["Prospects", "Hiring Contacts", "Candidates", "Pitch to Hiring Contacts", "Pitch to Candidates"];
const PITCH_LINES = ["Who I am", "What I offer", "The ask", "Objections"];

/** What is wrong with a Niche file, against the `niches/<slug>.md` format of `DESK.md`; empty when it is right. */
export function checkNiche(markdown: string): string[] {
  const problems: string[] = [];
  const lines = markdown.split("\n");
  if (!/^# \S/.test(lines[0] ?? "")) problems.push("the first line must be the title, `# <Niche name>`");
  if (!/^Calls in: \S/m.test(markdown)) problems.push("the `Calls in: <language>` line is missing or empty");

  const bodies = new Map<string, string>();
  const order: string[] = [];
  for (const part of markdown.split(/^(?=## )/m).slice(1)) {
    const title = /^## (.*)$/m.exec(part)![1].trim();
    order.push(title);
    bodies.set(title, part.replace(/^## .*\n?/, "").trim());
  }
  for (const name of SECTIONS) {
    const body = bodies.get(name);
    if (body === undefined) problems.push(`the section \`## ${name}\` is missing`);
    else if (body === "") problems.push(`the section \`## ${name}\` is empty`);
  }
  const present = order.filter((title) => SECTIONS.includes(title));
  if (SECTIONS.filter((name) => present.includes(name)).join("|") !== present.join("|")) {
    problems.push(`the sections must come in this order: ${SECTIONS.map((name) => `## ${name}`).join(", ")}`);
  }

  for (const name of ["Pitch to Hiring Contacts", "Pitch to Candidates"]) {
    const body = bodies.get(name);
    if (body === undefined || body === "") continue;
    for (const label of PITCH_LINES) {
      const found = new RegExp(`^- ${label}:(.*(?:\\n(?!- ).*)*)`, "m").exec(body);
      if (found === null) problems.push(`\`## ${name}\` lacks the line \`- ${label}:\``);
      else if (found[1].trim() === "") problems.push(`\`## ${name}\`: \`- ${label}:\` is empty`);
    }
  }
  return problems;
}
