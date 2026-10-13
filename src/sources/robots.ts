/**
 * A small robots.txt reader following RFC 9309: groups by user agent, Allow and Disallow rules,
 * `*` and `$` wildcards, and the longest matching rule wins (Allow wins a tie).
 */

interface Rule {
  allow: boolean;
  pattern: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

export interface Robots {
  groups: Group[];
}

export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      // Consecutive user-agent lines share one group.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      // An empty Disallow means "allow everything"; it adds no rule.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return { groups };
}

/** The rules for one product token (for example "reb"): its own groups, else the `*` groups. */
function rulesFor(robots: Robots, agent: string): Rule[] {
  const token = agent.toLowerCase();
  const own = robots.groups.filter((g) => g.agents.includes(token));
  const chosen = own.length > 0 ? own : robots.groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path);
}

/** Percent-encoding is compared in one form, so "/a%2fb" and "/a%2Fb" match. */
function normalize(path: string): string {
  return path.replace(/%[0-9a-f]{2}/gi, (code) => code.toUpperCase());
}

/** True when `agent` may read `path` (path plus query, for example "/pricing?plan=pro"). */
export function isAllowed(robots: Robots, agent: string, path: string): boolean {
  const target = normalize(path || "/");
  let best: Rule | null = null;
  for (const rule of rulesFor(robots, agent)) {
    if (!matches(normalize(rule.pattern), target)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
