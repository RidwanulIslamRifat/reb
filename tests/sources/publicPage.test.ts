import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import {
  checkPublicUrl,
  decodeBody,
  extractReadable,
  isLoginPath,
  looksLikeLogin,
} from "../../src/sources/publicPage.js";

const page = (name: string) => readFile(`tests/fixtures/pages/${name}`, "utf8");

describe("public URL check", () => {
  it("accepts public http and https addresses and drops the #fragment", () => {
    expect(checkPublicUrl("https://example.com/pricing#team").href).toBe(
      "https://example.com/pricing",
    );
    expect(checkPublicUrl("http://docs.example.com/").hostname).toBe("docs.example.com");
  });

  it.each([
    ["not a url", "not a web address"],
    ["ftp://example.com/file", "only reads public web pages"],
    ["file:///etc/passwd", "only reads public web pages"],
    ["https://user:pass@example.com/", "never logs in"],
    ["http://localhost:3000/", "local or private"],
    ["http://127.0.0.1/", "local or private"],
    ["http://10.1.2.3/", "local or private"],
    ["http://192.168.1.1/", "local or private"],
    ["http://[::1]/", "local or private"],
    ["http://printer.local/", "local or private"],
  ])("refuses %s", (url, message) => {
    expect(() => checkPublicUrl(url)).toThrow(RebError);
    expect(() => checkPublicUrl(url)).toThrow(message);
  });
});

describe("readable text", () => {
  it("keeps headings, lists and text, and drops scripts, styles and comments", async () => {
    const result = extractReadable(await page("home.html"));
    expect(result.title).toBe("Acme Notes – Notes for busy teams");
    expect(result.publisher).toBe("Acme Notes");
    expect(result.description).toBe("Acme Notes is a shared notebook for small teams.");
    expect(result.text).toContain("# Notes for busy teams");
    expect(result.text).toContain("## Features");
    expect(result.text).toContain("- Export to PDF & Markdown");
    expect(result.text).toContain("Acme Notes keeps your team's notes in one place.");
    expect(result.text).toContain("© 2026 Acme Inc.");
    expect(result.text).not.toMatch(/must not appear|font-family|<|__NEXT_DATA__/);
  });

  it("finds the publication date in meta tags or JSON-LD", async () => {
    expect(extractReadable(await page("pricing.html")).published).toBe("2026-09-01");
    expect(extractReadable(await page("blog-post.html")).published).toBe("2026-03-15");
    expect(extractReadable(await page("home.html")).published).toBeUndefined();
  });

  it("keeps table rows on their own lines", async () => {
    const { text } = extractReadable(await page("pricing.html"));
    expect(text).toMatch(/Team \$8 per user per month/);
  });

  it("decodes the charset given by the server", () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in ISO-8859-1
    expect(decodeBody(latin1, "text/html; charset=iso-8859-1")).toBe("café");
  });
});

describe("login detection", () => {
  it("spots a login form page but not a long page", async () => {
    const login = await page("login.html");
    expect(looksLikeLogin(login, extractReadable(login).text)).toBe(true);
    const home = await page("home.html");
    expect(looksLikeLogin(home, extractReadable(home).text)).toBe(false);
  });

  it("spots sign-in addresses but not docs about SSO", () => {
    expect(isLoginPath(new URL("https://x.example/login?next=/"))).toBe(true);
    expect(isLoginPath(new URL("https://x.example/users/sign_in"))).toBe(true);
    expect(isLoginPath(new URL("https://x.example/docs/sso"))).toBe(false);
    expect(isLoginPath(new URL("https://x.example/blog/logins-are-hard"))).toBe(false);
  });
});
