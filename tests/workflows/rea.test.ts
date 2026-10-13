import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REA_PASSIVE_TOOLS } from "../../src/domain/rea.js";
import { getRoleFile } from "../../src/workflows/handbook.js";
import { recordReaResult } from "../../src/workflows/rea.js";
import { filesUnder, sampleRun, testContext } from "../helpers.js";

const capture = {
  entries: [
    {
      url: "https://app.acme-notes.example/api/v1/notes?access_token=FAKE-SECRET-REA-1",
      headers: [
        { name: "Authorization", value: "Bearer FAKE-SECRET-REA-2" },
        { name: "Cookie", value: "sid=FAKE-SECRET-REA-3" },
      ],
      polling: true,
    },
  ],
  note: "uses Bearer FAKE-SECRET-REA-4-abcdefgh",
};

describe("record_rea_result (optional REA bridge)", () => {
  it("stores a passive tool's result redacted, as evidence citing the saved file", async () => {
    const ctx = await testContext();
    const run = await sampleRun();
    const result = await recordReaResult(ctx, {
      run,
      tool: "inspect_web_network_capture",
      subject: "feature-export",
      finding: "The export status is polled.",
      source: "evidence/inbox/session-01/network.har",
      result: capture,
    });
    expect(result.record).toMatchObject({
      role: "tech_observer",
      operation: "rea:inspect_web_network_capture",
      confidence: "observed",
    });
    expect(result.file).toMatch(/^evidence\/rea\/inspect_web_network_capture-[0-9a-f]{12}\.json$/);
    const stored = await readFile(join(run, result.file), "utf8");
    expect(stored).toContain("access_token=[REDACTED]");
    expect(stored).toContain('"polling": true');
    for (const file of await filesUnder(run)) {
      if (file.startsWith("evidence/inbox/")) continue;
      expect(await readFile(join(run, file), "latin1"), file).not.toContain("FAKE-SECRET");
    }
  });

  it.each(["open_browser", "browser_click", "drive_web_session", "capture_web_page_live"])(
    "refuses the non-passive REA tool %s",
    async (tool) => {
      const ctx = await testContext();
      const run = await sampleRun();
      await expect(
        recordReaResult(ctx, {
          run,
          tool,
          subject: "feature-export",
          finding: "x",
          source: "https://acme-notes.example/",
          result: { a: 1 },
        }),
      ).rejects.toThrow("Tools that open, drive or click in a browser are never used");
    },
  );

  it("does not let a page inspection be labelled observed", async () => {
    const ctx = await testContext();
    const run = await sampleRun();
    const base = {
      run,
      subject: "feature-export",
      finding: "The page loads a Stripe script.",
      source: "https://acme-notes.example/",
      result: "stripe.js found",
    };
    await expect(
      recordReaResult(ctx, { ...base, tool: "inspect_web_page", confidence: "observed" }),
    ).rejects.toThrow('can be at most "documented"');
    const bundle = await recordReaResult(ctx, { ...base, tool: "analyze_web_bundle" });
    expect(bundle.record.confidence).toBe("inferred");
  });

  it("is offered to the tech observer only, as optional tools", async () => {
    expect((await getRoleFile("tech_observer")).optional_tools).toEqual([...REA_PASSIVE_TOOLS]);
    expect((await getRoleFile("walkthrough_coach")).optional_tools).toEqual([]);
  });
});
