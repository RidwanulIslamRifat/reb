import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "../../src/sources/robots.js";

const fixture = parseRobots(await readFile("tests/fixtures/pages/robots.txt", "utf8"));

describe("robots.txt", () => {
  it("uses reb's own group when there is one", () => {
    expect(isAllowed(fixture, "reb", "/pricing")).toBe(true);
    expect(isAllowed(fixture, "reb", "/private/plans")).toBe(false);
    // The longest matching rule wins: Allow /private/press beats Disallow /private.
    expect(isAllowed(fixture, "reb", "/private/press/kit")).toBe(true);
    // reb's group replaces the * group, so /admin is not blocked for reb.
    expect(isAllowed(fixture, "reb", "/admin")).toBe(true);
  });

  it("matches user agents without caring about case", () => {
    expect(isAllowed(fixture, "REB", "/private")).toBe(false);
  });

  it("supports * and $ wildcards", () => {
    expect(isAllowed(fixture, "reb", "/files/report.pdf")).toBe(false);
    expect(isAllowed(fixture, "reb", "/files/report.pdf?x=1")).toBe(true);
  });

  it("falls back to the * group for other agents", () => {
    expect(isAllowed(fixture, "somebot", "/admin/users")).toBe(false);
    expect(isAllowed(fixture, "somebot", "/account/settings")).toBe(false);
    expect(isAllowed(fixture, "somebot", "/account/public")).toBe(true);
    expect(isAllowed(fixture, "badbot", "/")).toBe(false);
  });

  it("allows everything when the file is empty or has an empty Disallow", () => {
    expect(isAllowed(parseRobots(""), "reb", "/anything")).toBe(true);
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:\n"), "reb", "/x")).toBe(true);
  });

  it("blocks everything with Disallow: /", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow: /\n"), "reb", "/")).toBe(false);
  });
});
