import { describe, expect, it } from "vitest";
import type { CapturedScreen, DesignSnapshot, Look } from "../../src/domain/capture.js";
import {
  describeLook,
  designDetail,
  hexColor,
  inferDesignModel,
  screenLayout,
} from "../../src/domain/designModel.js";

const look = (over: Partial<Look> = {}): Look => ({
  width: 80,
  height: 32,
  padding: "6 12 6 12",
  radius: "6px",
  background: "rgb(79, 70, 229)",
  color: "rgb(255, 255, 255)",
  border: "",
  font: "14px/20px Inter 500",
  shadow: "",
  opacity: "1",
  ...over,
});

/** A measured screen as the page script returns it (colours still rgb). */
const raw = (over: Partial<DesignSnapshot> = {}): DesignSnapshot => ({
  viewport: { width: 1440, height: 900, page_height: 1400 },
  colors: [
    { value: "background rgb(255, 255, 255)", count: 40 },
    { value: "text rgb(17, 24, 39)", count: 30 },
    { value: "text rgb(107, 114, 128)", count: 12 },
    { value: "text rgb(255, 255, 255)", count: 6 },
    { value: "border rgb(229, 231, 235)", count: 20 },
    { value: "background rgb(249, 250, 251)", count: 8 },
  ],
  fonts: [{ value: "Inter", count: 50 }],
  text_styles: [
    {
      role: "h1",
      count: 1,
      size: 24,
      line_height: 32,
      weight: "600",
      family: "Inter",
      color: "rgb(17, 24, 39)",
      letter_spacing: "",
    },
    {
      role: "body",
      count: 20,
      size: 14,
      line_height: 20,
      weight: "400",
      family: "Inter",
      color: "rgb(17, 24, 39)",
      letter_spacing: "",
    },
  ],
  spacing: [
    { value: "8px", count: 30 },
    { value: "16px", count: 20 },
    { value: "4px", count: 10 },
    { value: "1px", count: 50 },
  ],
  radius: [
    { value: "6px", count: 12 },
    { value: "9999px", count: 3 },
  ],
  shadows: [{ value: "rgba(0, 0, 0, 0.1) 0px 1px 3px 0px", count: 4 }],
  icon_sizes: [{ value: "16px", count: 20 }],
  motion: [{ value: "0.15s ease", count: 5 }],
  regions: [
    {
      name: "sidebar",
      x: 0,
      y: 0,
      width: 240,
      height: 900,
      background: "rgb(249, 250, 251)",
      position: "fixed",
    },
    { name: "top bar", x: 240, y: 0, width: 1200, height: 56, background: "", position: "static" },
    {
      name: "main",
      x: 240,
      y: 56,
      width: 1200,
      height: 800,
      background: "rgb(255, 255, 255)",
      position: "static",
    },
  ],
  components: [
    {
      kind: "button",
      count: 5,
      variants: [
        { count: 3, style: look() },
        {
          count: 2,
          style: look({
            background: "rgb(255, 255, 255)",
            color: "rgb(17, 24, 39)",
            border: "1px solid rgb(229, 231, 235)",
          }),
        },
      ],
      states: [{ state: "disabled", style: look({ opacity: "0.5" }) }],
    },
    {
      kind: "table_row",
      count: 10,
      variants: [{ count: 10, style: look({ height: 44 }) }],
      states: [],
    },
  ],
  states: ["empty"],
  ...over,
});

const screen = (id: string, design?: DesignSnapshot) =>
  ({ id, design: design && designDetail(design) }) as CapturedScreen;

describe("design model (pixel-level rebuild)", () => {
  it("writes colours as hex, keeping see-through colours readable", () => {
    expect(hexColor("rgb(79, 70, 229)")).toBe("#4f46e5");
    expect(hexColor("rgba(0, 0, 0, 0.1) 0px 1px 3px 0px")).toBe("#000000 at 10% 0px 1px 3px 0px");
    expect(hexColor("1px solid rgb(229, 231, 235)")).toBe("1px solid #e5e7eb");
  });

  it("cleans and bounds what the page measured, and keeps nothing it does not know", () => {
    const d = designDetail({
      ...raw(),
      colors: Array.from({ length: 100 }, (_, i) => ({ value: `text rgb(${i}, 0, 0)`, count: 1 })),
      fonts: [{ value: "x".repeat(500), count: 1 }],
    })!;
    expect(d.colors).toHaveLength(40);
    expect(d.colors[1]!.value).toBe("text #010000");
    expect(d.fonts[0]!.value.length).toBeLessThanOrEqual(120);
    expect(d.regions[0]!.background).toBe("#f9fafb");
    expect(designDetail(undefined)).toBeUndefined();
  });

  it("describes a screen's layout, regions, components and states", () => {
    const fields = screenLayout(designDetail(raw()));
    expect(fields["layout"]).toBe(
      "sidebar 240px wide on the left, top bar 56px high, main area 1200px wide, page 1400px tall",
    );
    expect(fields["regions"]).toContain("sidebar: at 0,0, 240x900px, background #f9fafb, fixed");
    expect(fields["components"]).toEqual(["Button", "Table row"]);
    expect(fields["states"]).toEqual(["empty"]);
    expect(fields["viewport"]).toBe("1440x900");
    expect(screenLayout(undefined)).toEqual({});
  });

  it("turns the screens into named design tokens", () => {
    const { tokens } = inferDesignModel([
      screen("screen-a", raw()),
      screen("screen-b", raw()),
      screen("screen-c"),
    ]);
    const value = (name: string) => tokens.find((t) => t.name === name)?.value;
    expect(value("Page background")).toBe("#ffffff");
    expect(value("Sidebar background")).toBe("#f9fafb");
    expect(value("Text primary")).toBe("#111827");
    expect(value("Text secondary")).toBe("#6b7280");
    expect(value("Primary")).toBe("#4f46e5");
    expect(value("Text on primary")).toBe("#ffffff");
    expect(value("Border")).toBe("#e5e7eb");
    expect(value("Font family")).toBe("Inter");
    expect(value("Heading 1")).toBe("24px/32px Inter 600, #111827");
    expect(value("Spacing scale")).toBe("4px, 8px, 16px");
    expect(value("Radius small")).toBe("6px");
    expect(value("Radius full (pill or circle)")).toBe("9999px");
    expect(value("Shadow 1")).toBe("#000000 at 10% 0px 1px 3px 0px");
    expect(value("Sidebar width")).toBe("240px");
    expect(value("Top bar height")).toBe("56px");
    expect(value("Button height")).toBe("32px");
    expect(value("Table row height")).toBe("44px");
    expect(value("Icon size")).toBe("16px");
    expect(value("Transition")).toBe("0.15s ease");
    expect(tokens.find((t) => t.name === "Primary")!.usage).toContain("on all 2 screens");
    expect(tokens.find((t) => t.name === "Primary")!.screens).toEqual(["screen-a", "screen-b"]);
    expect(new Set(tokens.map((t) => t.id)).size).toBe(tokens.length);
  });

  it("finds the app shell, each component with variants and states, and screen states", () => {
    const { patterns } = inferDesignModel([screen("screen-a", raw())]);
    const byName = (name: string) => patterns.find((p) => p.name === name)!;
    expect(byName("App shell").anatomy).toBe(
      "sidebar 240px wide on the left, background #f9fafb, fixed; top bar 56px high; main area 1200px wide",
    );
    const button = byName("Button");
    expect(button.kind).toBe("component");
    expect(button.anatomy).toContain(
      "height 32px, padding 6 12 6 12px, corners 6px, background #4f46e5",
    );
    expect(button.variants[1]).toBe(
      "variant 2: background #ffffff, text #111827, border 1px solid #e5e7eb (2 seen)",
    );
    expect(button.states).toEqual(["default", "disabled: opacity 0.5"]);
    expect(byName("Empty state").screens).toEqual(["screen-a"]);
  });

  it("returns nothing for captures made before the design was measured", () => {
    expect(inferDesignModel([screen("screen-a")])).toEqual({ tokens: [], patterns: [] });
  });

  it("describes only what differs from the default look", () => {
    const base = designDetail(raw())!.components[0]!.variants[0]!.style;
    expect(describeLook({ ...base, opacity: "0.5" }, base)).toBe("opacity 0.5");
  });
});
