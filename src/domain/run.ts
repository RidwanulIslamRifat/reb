import { RebError } from "./errors.js";

/**
 * Turns what a person typed ("https://www.Example.com/pricing") into the bare domain ("example.com").
 * Throws a RebError when it does not look like a domain.
 */
export function normalizeDomain(input: string): string {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]!
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new RebError(
      `"${input}" does not look like a product domain.`,
      'Give the domain of the product, for example "example.com".',
    );
  }
  return host;
}

/** Local date as YYYY-MM-DD (ROADMAP decision 20 uses the local date). */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Run folder name before clash handling: "example.com" on 2026-10-13 -> "example-com-2026-10-13". */
export function runSlug(domain: string, now: Date): string {
  return `${domain.replace(/[^a-z0-9]+/g, "-")}-${localDate(now)}`;
}
