import { join } from "node:path";
import {
  CAPTURE_LIMITS,
  captionLines,
  captureNotes,
  maskPersonal,
  normalizeUrl,
  screenHints,
  screenId,
  screenName,
  screenDetail,
  screenPattern,
  skipReason,
  type CapturedScreen,
  type PageSnapshot,
  type SkipReason,
} from "../domain/capture.js";
import { RebError } from "../domain/errors.js";
import { launchCaptureBrowser, type BrowserLauncher } from "../sources/browser.js";
import { writeRunFile } from "../storage/inbox.js";
import type { Context } from "./context.js";
import { linkNodes, upsertNode } from "./graph.js";
import { analyseCapture } from "./featureModel.js";
import { importInbox, pickSession } from "./handsOn.js";
import { logged } from "./logging.js";
import { redactText } from "./redact.js";
import { readBrief, resolveRun } from "./runs.js";

/** What capture needs from its caller: the person at the keyboard, and the browser. */
export interface CaptureDeps {
  /** Shows a message and waits until the person says they are ready (presses Enter). */
  waitForUser: (message: string) => Promise<void>;
  /** Progress lines for the person. */
  say?: (text: string) => void;
  /** The browser; the real one when left out. Tests pass a fake. */
  launch?: BrowserLauncher;
  headless?: boolean;
  sleep?: (ms: number) => Promise<void>;
}

const clean = (items: string[]) => [
  ...new Set(items.map((t) => maskPersonal(redactText(t))).filter(Boolean)),
];

/**
 * reb capture (SPEC 2.3 exception, ROADMAP decision 23). The adapter asks the person first. Then:
 * a visible browser opens `url`, the person logs in themselves, and reb opens the product's own
 * links one at a time (never risky ones, never other sites), saving a screenshot and the visible
 * labels of each screen into a new inbox session. It then adds a screen node per screen with its
 * navigation links, imports the screenshots as observed evidence, and writes
 * notes/capture-<session>.md with a sitemap and what each screen suggests for the analysis.
 */
export async function captureProduct(
  ctx: Context,
  input: { run?: string; url?: string; pages?: number; depth?: number; delay_ms?: number },
  deps: CaptureDeps,
) {
  const run = await resolveRun(ctx, input.run);
  const pages = Math.min(Math.max(input.pages ?? CAPTURE_LIMITS.pages, 1), CAPTURE_LIMITS.maxPages);
  const depthLimit = Math.min(Math.max(input.depth ?? CAPTURE_LIMITS.depth, 0), 6);
  const delay = Math.max(input.delay_ms ?? CAPTURE_LIMITS.delayMs, CAPTURE_LIMITS.minDelayMs);
  const say = deps.say ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  return logged(
    ctx,
    "capture_product",
    run,
    { url: input.url, pages, depth: depthLimit },
    async () => {
      const { brief } = await readBrief(run);
      const start = input.url ?? brief.url;
      if (!/^https?:\/\//i.test(start)) {
        throw new RebError(
          `"${start}" is not a web address to open.`,
          "Give the product's login or home page, for example: reb capture https://app.example.com/login",
        );
      }
      const session = await pickSession(run.paths);
      const folder = run.paths.inboxSession(session);
      const screens: CapturedScreen[] = [];
      const skipped: Array<{ url: string; reason: SkipReason }> = [];
      const linksOf = new Map<string, Set<string>>();
      const browser = await (deps.launch ?? launchCaptureBrowser)({ headless: deps.headless });
      let origin: string;
      try {
        await browser.open(start);
        await deps.waitForUser(
          "Log in to the product in the browser window that just opened, go to its main screen, then " +
            "press Enter here. reb does not see or keep your password.",
        );
        const first = normalizeUrl(await browser.currentUrl(), start);
        origin = new URL(first).origin;
        say(`Capturing screens of ${origin}, following links only (at most ${pages} screens).`);

        const queue: Array<{ url: string; depth: number; from: string | null }> = [
          { url: first, depth: 0, from: null },
        ];
        const seenPatterns = new Set<string>();
        const idOfPattern = new Map<string, string>();
        while (queue.length && screens.length < pages) {
          const next = queue.shift()!;
          const pattern = screenPattern(next.url);
          if (seenPatterns.has(pattern)) {
            const known = idOfPattern.get(pattern);
            if (next.from && known) linksOf.get(next.from)?.add(known);
            continue;
          }
          seenPatterns.add(pattern);
          if (next.from !== null) {
            await sleep(delay);
            const opened = await browser.goto(next.url);
            const landed = normalizeUrl(opened.url, origin);
            // Sent elsewhere (another site, or back to the login page): stop following this link.
            if (!opened.ok || new URL(landed).origin !== origin || skipReason(landed, origin)) {
              skipped.push({ url: pattern, reason: opened.ok ? "redirected" : "did not open" });
              continue;
            }
          }
          const snap: PageSnapshot = await browser.snapshot();
          const id = screenId(pattern);
          idOfPattern.set(pattern, id);
          if (next.from) linksOf.get(next.from)?.add(id);
          linksOf.set(id, new Set());
          const file = `${id}.png`;
          await writeRunFile(join(folder, file), await browser.screenshot());
          const base = {
            id,
            url: pattern,
            pattern,
            depth: next.depth,
            file,
            title: maskPersonal(redactText(snap.title)),
            headings: clean(snap.headings),
            buttons: clean(snap.buttons),
            fields: clean(snap.fields),
            columns: clean(snap.columns),
            ...screenDetail({
              ...snap,
              form_fields: snap.form_fields?.map((f) => ({
                ...f,
                label: redactText(f.label),
                options: f.options.map(redactText),
              })),
              notices: snap.notices?.map(redactText),
            }),
          };
          const taken = new Set(screens.map((s) => s.name));
          let name = screenName(base);
          if (taken.has(name)) name = `${name} (${pattern})`;
          screens.push({ ...base, name, links_to: [], hints: screenHints({ ...base, name }) });
          say(`  ${screens.length}. ${name} (${pattern})`);
          if (next.depth >= depthLimit) continue;
          for (const link of snap.links) {
            const reason = skipReason(link.href, origin);
            if (reason) {
              if (reason !== "other site" && reason !== "not a web page") {
                skipped.push({ url: screenPattern(normalizeUrl(link.href, origin)), reason });
              }
              continue;
            }
            queue.push({ url: normalizeUrl(link.href, origin), depth: next.depth + 1, from: id });
          }
        }
      } finally {
        await browser.close();
      }
      if (screens.length === 0) {
        throw new RebError(
          "No screen was captured.",
          "Check that you were logged in and on the product's main screen before pressing Enter.",
        );
      }
      for (const s of screens)
        s.links_to = [...(linksOf.get(s.id) ?? [])].filter((t) => t !== s.id);

      // Files: captions next to the screenshots, the raw map for tools, the notes for the analysts.
      await writeRunFile(join(folder, "capture-notes.md"), captionLines(screens));
      const uniqueSkips = [...new Map(skipped.map((s) => [`${s.reason} ${s.url}`, s])).values()];
      await writeRunFile(
        join(run.paths.imports(session), "capture.json"),
        JSON.stringify(
          {
            start: screenPattern(normalizeUrl(start, start)),
            origin,
            screens,
            skipped: uniqueSkips,
          },
          null,
          2,
        ) + "\n",
      );
      const notesFile = `notes/capture-${session}.md`;
      await writeRunFile(
        join(run.paths.dir, ...notesFile.split("/")),
        captureNotes({
          product: brief.product,
          session,
          start: origin,
          screens,
          skipped: uniqueSkips,
        }),
      );

      // The graph: one screen node per screen, with its address and navigation.
      const where = run.paths.dir;
      for (const s of screens) {
        await upsertNode(ctx, {
          run: where,
          type: "screen",
          name: s.name,
          id: s.id,
          label: "observed",
          fields: { path: s.pattern },
          body: `\n# ${s.name}\n\nCaptured at \`${s.pattern}\` (${notesFile}).\n`,
        });
      }
      for (const s of screens) {
        for (const to of s.links_to)
          await linkNodes(ctx, { run: where, from: s.id, type: "navigates_to", to });
      }
      const imported = await importInbox(ctx, { run: where, session });
      // The feature model: modules, features, entities, rules and requirements from the screens.
      const analysis = await analyseCapture(ctx, { run: where, session });

      return {
        ...run,
        session,
        origin,
        screens: screens.map(({ id, name, pattern, hints }) => ({
          id,
          name,
          path: pattern,
          suggests: [...new Set(hints.map((h) => h.type))],
        })),
        skipped: uniqueSkips.length,
        notes: notesFile,
        feature_model: {
          notes: analysis.notes,
          modules: analysis.modules,
          features: analysis.features,
          entities: analysis.entities,
          rules: analysis.rules,
          requirements: analysis.requirements,
          created: analysis.created.length,
        },
        evidence: imported.items.filter((i) => i.record).map((i) => i.record!),
      };
    },
  );
}
