import type {
  CapturedScreen,
  ComponentLook,
  DesignSnapshot,
  Look,
  Region,
  Tally,
  TextStyle,
} from "./capture.js";
import { nodeIdFor } from "./node.js";
import type { PATTERN_KINDS, TOKEN_CATEGORIES } from "./nodeFields.js";

/**
 * The design model (pixel-level rebuild, SPEC 2.3): turns the measured visual design of captured
 * screens into design tokens (colours, typography, spacing, radius, shadows, sizes, motion) and UX
 * patterns (the app shell, each kind of component with its variants and visible states, empty and
 * loading states). Everything here is a measurement of computed styles; the product's code, logos,
 * icons, illustrations and text are never part of it.
 */

export interface DesignToken {
  id: string;
  name: string;
  category: (typeof TOKEN_CATEGORIES)[number];
  value: string;
  usage: string;
  screens: string[];
}

export interface UxPattern {
  id: string;
  name: string;
  kind: (typeof PATTERN_KINDS)[number];
  anatomy: string;
  variants: string[];
  states: string[];
  screens: string[];
}

export interface DesignModel {
  tokens: DesignToken[];
  patterns: UxPattern[];
}

// ---------------------------------------------------------------------------------------------
// Cleaning what the page script measured

const num = (v: unknown, max = 100_000) => Math.max(0, Math.min(Math.round(Number(v) || 0), max));
const short = (v: unknown, max = 120) => String(v ?? "").slice(0, max);

/** "rgb(79, 70, 229)" becomes "#4f46e5"; a see-through colour keeps its strength: "#000000 at 50%". */
export function hexColor(value: string): string {
  return value.replace(
    /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/g,
    (_, r: string, g: string, b: string, a?: string) => {
      const hex = `#${[r, g, b].map((c) => Math.min(255, Number(c)).toString(16).padStart(2, "0")).join("")}`;
      if (a === undefined) return hex;
      const alpha = a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
      return alpha >= 1 ? hex : `${hex} at ${Math.round(alpha * 100)}%`;
    },
  );
}

const tallies = (items: unknown, max: number): Tally[] =>
  (Array.isArray(items) ? items : [])
    .filter((t): t is Tally => !!t && typeof (t as Tally).value === "string")
    .slice(0, max)
    .map((t) => ({ value: hexColor(short(t.value)), count: num(t.count) }))
    .filter((t) => t.value.trim() && t.count > 0);

const look = (l: Partial<Look> | undefined): Look => ({
  width: num(l?.width),
  height: num(l?.height),
  padding: short(l?.padding, 40),
  radius: short(l?.radius, 20),
  background: hexColor(short(l?.background, 60)),
  color: hexColor(short(l?.color, 60)),
  border: hexColor(short(l?.border, 80)),
  font: short(l?.font, 80),
  shadow: hexColor(short(l?.shadow)),
  opacity: short(l?.opacity, 6),
});

/** The design part of a snapshot, bounded and with colours as hex; undefined when there is none. */
export function designDetail(raw: Partial<DesignSnapshot> | undefined): DesignSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const arr = <T>(v: unknown, max: number) => (Array.isArray(v) ? (v as T[]).slice(0, max) : []);
  return {
    viewport: {
      width: num(raw.viewport?.width),
      height: num(raw.viewport?.height),
      page_height: num(raw.viewport?.page_height),
    },
    colors: tallies(raw.colors, 40),
    fonts: tallies(raw.fonts, 6),
    text_styles: arr<TextStyle>(raw.text_styles, 16).map((t) => ({
      role: short(t.role, 20),
      count: num(t.count),
      size: num(t.size, 200),
      line_height: num(t.line_height, 300),
      weight: short(t.weight, 6),
      family: short(t.family, 60),
      color: hexColor(short(t.color, 60)),
      letter_spacing: short(t.letter_spacing, 12),
    })),
    spacing: tallies(raw.spacing, 16),
    radius: tallies(raw.radius, 8),
    shadows: tallies(raw.shadows, 6),
    icon_sizes: tallies(raw.icon_sizes, 4),
    motion: tallies(raw.motion, 4),
    regions: arr<Region>(raw.regions, 10).map((r) => ({
      name: short(r.name, 20),
      x: num(r.x),
      y: num(r.y),
      width: num(r.width),
      height: num(r.height),
      background: hexColor(short(r.background, 60)),
      position: short(r.position, 10),
    })),
    components: arr<ComponentLook>(raw.components, 20).map((c) => ({
      kind: short(c.kind, 20),
      count: num(c.count),
      variants: arr<{ count: number; style: Look }>(c.variants, 4).map((v) => ({
        count: num(v.count),
        style: look(v.style),
      })),
      states: arr<{ state: string; style: Look }>(c.states, 8).map((s) => ({
        state: short(s.state, 20),
        style: look(s.style),
      })),
    })),
    states: arr<string>(raw.states, 8).map((s) => short(s, 30)),
  };
}

// ---------------------------------------------------------------------------------------------
// Words for measurements

const COMPONENTS: Record<string, { name: string; kind: UxPattern["kind"] }> = {
  button: { name: "Button", kind: "component" },
  input: { name: "Text input", kind: "component" },
  select: { name: "Drop-down", kind: "component" },
  checkbox: { name: "Checkbox", kind: "component" },
  radio: { name: "Radio button", kind: "component" },
  toggle: { name: "Toggle switch", kind: "component" },
  tab: { name: "Tabs", kind: "navigation" },
  table: { name: "Data table", kind: "component" },
  table_row: { name: "Table row", kind: "component" },
  nav_item: { name: "Navigation item", kind: "navigation" },
  badge: { name: "Badge", kind: "component" },
  card: { name: "Card", kind: "component" },
  dialog: { name: "Dialog", kind: "interaction" },
  menu: { name: "Menu", kind: "interaction" },
  tooltip: { name: "Tooltip", kind: "feedback" },
  alert: { name: "Notice or toast", kind: "feedback" },
  avatar: { name: "Avatar", kind: "component" },
};

const TEXT_ROLES: Record<string, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  body: "Body text",
  small: "Small text",
  label: "Label text",
  link: "Link text",
  button: "Button text",
  input: "Input text",
  table_header: "Table header text",
};

/** "height 32px, padding 6 12 6 12px, corners 6px, background #4f46e5, text #ffffff, 14px/20px Inter 500". */
export function describeLook(l: Look, base?: Look): string {
  const differs = (k: keyof Look) => !base || base[k] !== l[k];
  return [
    l.height && differs("height") ? `height ${l.height}px` : "",
    l.padding && l.padding !== "0 0 0 0" && differs("padding") ? `padding ${l.padding}px` : "",
    l.radius && l.radius !== "0px" && differs("radius") ? `corners ${l.radius}` : "",
    l.background && differs("background") ? `background ${l.background}` : "",
    l.color && differs("color") ? `text ${l.color}` : "",
    l.font && differs("font") ? l.font : "",
    l.border && differs("border") ? `border ${l.border}` : "",
    l.shadow && differs("shadow") ? `shadow ${l.shadow}` : "",
    l.opacity && l.opacity !== "1" && differs("opacity") ? `opacity ${l.opacity}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

const px = (v: string) => parseFloat(v) || 0;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Lightness of a hex colour, 0 (black) to 1 (white); 1 when it cannot be read. */
function lightness(color: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/.exec(color);
  if (!m) return 1;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const regionOf = (d: DesignSnapshot, name: string) => d.regions.find((r) => r.name === name);

/** The text style of a role (h1, body, link ...) used by the most elements over all screens. */
function mostCommonStyle(
  screens: Array<{ d: DesignSnapshot }>,
  role: string,
): TextStyle | undefined {
  const all = screens.flatMap(({ d }) => d.text_styles.filter((t) => t.role === role));
  return all.sort((a, b) => b.count - a.count)[0];
}

// ---------------------------------------------------------------------------------------------
// One screen

/** The layout fields of a screen node, from its measured design. */
export function screenLayout(d: DesignSnapshot | undefined): Record<string, unknown> {
  if (!d) return {};
  const parts: string[] = [];
  const side = regionOf(d, "sidebar");
  const bar = regionOf(d, "top bar");
  const main = regionOf(d, "main");
  if (side)
    parts.push(
      `sidebar ${side.width}px wide on the ${side.x > d.viewport.width / 2 ? "right" : "left"}`,
    );
  if (bar) parts.push(`top bar ${bar.height}px high`);
  if (main) parts.push(`main area ${main.width}px wide`);
  if (regionOf(d, "dialog")) parts.push("a dialog open over the screen");
  if (d.viewport.page_height > d.viewport.height)
    parts.push(`page ${d.viewport.page_height}px tall`);
  const viewport = d.viewport.width ? `${d.viewport.width}x${d.viewport.height}` : "";
  return {
    ...(parts.length ? { layout: parts.join(", ") } : {}),
    regions: d.regions.map(
      (r) =>
        `${r.name}: at ${r.x},${r.y}, ${r.width}x${r.height}px${r.background ? `, background ${r.background}` : ""}${r.position === "fixed" || r.position === "sticky" ? `, ${r.position}` : ""}`,
    ),
    components: d.components.map((c) => COMPONENTS[c.kind]?.name ?? c.kind),
    states: d.states,
    ...(viewport ? { viewport } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// All screens

type Sum = Map<string, { count: number; screens: Set<string> }>;

function sum(
  screens: Array<{ id: string; d: DesignSnapshot }>,
  pick: (d: DesignSnapshot) => Tally[],
): Sum {
  const out: Sum = new Map();
  for (const { id, d } of screens) {
    for (const t of pick(d)) {
      const e = out.get(t.value) ?? { count: 0, screens: new Set<string>() };
      e.count += t.count;
      e.screens.add(id);
      out.set(t.value, e);
    }
  }
  return out;
}

const ranked = (s: Sum) => [...s].sort((a, b) => b[1].count - a[1].count);
const onScreens = (screens: Set<string> | string[], total: number) => {
  const n = Array.isArray(screens) ? screens.length : screens.size;
  if (total === 1) return "the captured screen";
  return n === total ? `all ${n} screens` : plural(n, "screen");
};

/** The design tokens and UX patterns of all captured screens that carry a measured design. */
export function inferDesignModel(captured: CapturedScreen[]): DesignModel {
  const screens = captured
    .filter((s): s is CapturedScreen & { design: DesignSnapshot } => !!s.design)
    .map((s) => ({ id: s.id, d: s.design }));
  if (!screens.length) return { tokens: [], patterns: [] };
  const total = screens.length;
  const tokens: DesignToken[] = [];
  const token = (
    category: DesignToken["category"],
    name: string,
    value: string,
    usage: string,
    on: Iterable<string>,
  ) => {
    const id = nodeIdFor("design_token", name);
    if (!value || tokens.some((t) => t.id === id)) return;
    tokens.push({ id, name, category, value, usage, screens: [...on] });
  };

  // Colours
  const colors = sum(screens, (d) => d.colors);
  const byUse = (use: string) =>
    ranked(colors)
      .filter(([k]) => k.startsWith(`${use} `))
      .map(([k, v]) => ({ value: k.slice(use.length + 1), ...v }));
  const backgrounds = byUse("background");
  const texts = byUse("text");
  const borders = byUse("border");
  const regionColour = (name: string) => {
    const seen = new Map<string, Set<string>>();
    for (const { id, d } of screens) {
      const bg = regionOf(d, name)?.background;
      if (bg) seen.set(bg, (seen.get(bg) ?? new Set()).add(id));
    }
    return [...seen].sort((a, b) => b[1].size - a[1].size)[0];
  };
  const page =
    regionColour("main") ??
    (backgrounds[0] ? [backgrounds[0].value, backgrounds[0].screens] : undefined);
  if (page)
    token(
      "color",
      "Page background",
      page[0],
      `background of the main area on ${onScreens(page[1], total)}`,
      page[1],
    );
  const side = regionColour("sidebar");
  if (side)
    token(
      "color",
      "Sidebar background",
      side[0],
      `background of the sidebar on ${onScreens(side[1], total)}`,
      side[1],
    );
  const bar = regionColour("top bar");
  if (bar)
    token(
      "color",
      "Top bar background",
      bar[0],
      `background of the top bar on ${onScreens(bar[1], total)}`,
      bar[1],
    );
  // Body text colours: links and the white text on filled buttons get their own tokens below.
  const linkColour = mostCommonStyle(screens, "link")?.color;
  const plainTexts = texts.filter((t) => t.value !== linkColour && lightness(t.value) <= 0.9);
  ["Text primary", "Text secondary", "Text muted"].forEach((name, i) => {
    const t = plainTexts[i];
    if (t)
      token(
        "color",
        name,
        t.value,
        `text of ${plural(t.count, "element")} on ${onScreens(t.screens, total)}`,
        t.screens,
      );
  });
  if (borders[0]) {
    const b = borders[0];
    token(
      "color",
      "Border",
      b.value,
      `borders of ${plural(b.count, "element")} on ${onScreens(b.screens, total)}`,
      b.screens,
    );
  }
  // The primary colour: the most used button fill that is not white, grey-light or the page colour.
  const fills = new Map<string, { count: number; screens: Set<string> }>();
  for (const { id, d } of screens) {
    for (const v of d.components.find((c) => c.kind === "button")?.variants ?? []) {
      const bg = v.style.background;
      if (!bg || bg === page?.[0] || lightness(bg) > 0.9 || bg.includes(" at ")) continue;
      const e = fills.get(bg) ?? { count: 0, screens: new Set<string>() };
      e.count += v.count;
      e.screens.add(id);
      fills.set(bg, e);
    }
  }
  const primary = ranked(fills)[0];
  if (primary) {
    token(
      "color",
      "Primary",
      primary[0],
      `fill of the main buttons (${plural(primary[1].count, "button")}) on ${onScreens(primary[1].screens, total)}`,
      primary[1].screens,
    );
  }
  if (primary) {
    const on = screens
      .flatMap(({ d }) => d.components.find((c) => c.kind === "button")?.variants ?? [])
      .find((v) => v.style.background === primary[0])?.style.color;
    if (on) token("color", "Text on primary", on, "text on the main buttons", primary[1].screens);
  }
  if (linkColour) {
    const on = screens.filter(({ d }) =>
      d.text_styles.some((t) => t.role === "link" && t.color === linkColour),
    );
    token(
      "color",
      "Link",
      linkColour,
      `link text on ${onScreens(
        on.map((x) => x.id),
        total,
      )}`,
      on.map((x) => x.id),
    );
  }
  const named = new Set(tokens.map((t) => t.value));
  let n = 0;
  for (const c of [...backgrounds, ...texts]) {
    if (n >= 8 || named.has(c.value) || c.count < 3) continue;
    named.add(c.value);
    n++;
    const uses = ["background", "text", "border"]
      .map((u) => [u, colors.get(`${u} ${c.value}`)?.count ?? 0] as const)
      .filter(([, k]) => k > 0)
      .map(([u, k]) => `${u} of ${plural(k, "element")}`);
    token(
      "color",
      `Colour ${c.value}`,
      c.value,
      `${uses.join(", ")} on ${onScreens(c.screens, total)}`,
      c.screens,
    );
  }

  // Typography
  const fonts = ranked(sum(screens, (d) => d.fonts));
  fonts.slice(0, 2).forEach(([family, v], i) => {
    if (i === 0 || v.count >= (fonts[0]?.[1].count ?? 0) / 10) {
      token(
        "typography",
        i === 0 ? "Font family" : "Second font family",
        family,
        `text of ${plural(v.count, "element")} on ${onScreens(v.screens, total)}`,
        v.screens,
      );
    }
  });
  for (const [role, name] of Object.entries(TEXT_ROLES)) {
    const styles = new Map<string, { count: number; screens: Set<string> }>();
    for (const { id, d } of screens) {
      const t = d.text_styles.find((x) => x.role === role);
      if (!t || !t.size) continue;
      const value = `${t.size}px/${t.line_height ? `${t.line_height}px` : "normal"} ${t.family} ${t.weight}${t.letter_spacing ? `, letter spacing ${t.letter_spacing}` : ""}, ${t.color}`;
      const e = styles.get(value) ?? { count: 0, screens: new Set<string>() };
      e.count += t.count;
      e.screens.add(id);
      styles.set(value, e);
    }
    const best = ranked(styles)[0];
    if (best)
      token(
        "typography",
        name,
        best[0],
        `${name.toLowerCase()} on ${onScreens(best[1].screens, total)}`,
        best[1].screens,
      );
  }

  // Spacing, radius, shadows, motion
  const spacing = ranked(sum(screens, (d) => d.spacing))
    .filter(([v]) => px(v) >= 2)
    .slice(0, 10);
  if (spacing.length) {
    const scale = spacing.map(([v]) => v).sort((a, b) => px(a) - px(b));
    const on = new Set(spacing.flatMap(([, v]) => [...v.screens]));
    token(
      "spacing",
      "Spacing scale",
      scale.join(", "),
      "padding, margins and gaps, most used values in size order",
      on,
    );
    token(
      "spacing",
      "Most used spacing",
      spacing[0]![0],
      `${plural(spacing[0]![1].count, "use")} on ${onScreens(spacing[0]![1].screens, total)}`,
      spacing[0]![1].screens,
    );
  }
  const radii = ranked(sum(screens, (d) => d.radius))
    .slice(0, 4)
    .sort((a, b) => px(a[0]) - px(b[0]));
  const RADIUS = ["Radius small", "Radius medium", "Radius large", "Radius extra large"];
  radii.forEach(([value, v], i) => {
    const kinds = new Set<string>();
    for (const { d } of screens) {
      for (const c of d.components)
        if (c.variants.some((x) => x.style.radius === value))
          kinds.add(COMPONENTS[c.kind]?.name ?? c.kind);
    }
    const name =
      px(value) >= 999 || value.endsWith("%")
        ? "Radius full (pill or circle)"
        : radii.length === 1
          ? "Corner radius"
          : RADIUS[i]!;
    token(
      "radius",
      name,
      value,
      kinds.size
        ? `corners of ${[...kinds].slice(0, 5).join(", ")}`
        : `corners of ${plural(v.count, "element")}`,
      v.screens,
    );
  });
  ranked(sum(screens, (d) => d.shadows))
    .slice(0, 3)
    .forEach(([value, v], i) => {
      token(
        "shadow",
        `Shadow ${i + 1}`,
        value,
        `${plural(v.count, "element")} on ${onScreens(v.screens, total)}`,
        v.screens,
      );
    });
  const motion = ranked(sum(screens, (d) => d.motion))[0];
  if (motion)
    token(
      "motion",
      "Transition",
      motion[0],
      `transitions of ${plural(motion[1].count, "element")}`,
      motion[1].screens,
    );

  // Sizes
  const sizeOf = (name: string, pick: (d: DesignSnapshot) => number | undefined, usage: string) => {
    const seen = new Map<string, Set<string>>();
    for (const { id, d } of screens) {
      const v = pick(d);
      if (v) seen.set(`${v}px`, (seen.get(`${v}px`) ?? new Set()).add(id));
    }
    const best = [...seen].sort((a, b) => b[1].size - a[1].size)[0];
    if (best) token("size", name, best[0], `${usage} on ${onScreens(best[1], total)}`, best[1]);
  };
  const variantHeight = (kind: string) => (d: DesignSnapshot) =>
    d.components.find((c) => c.kind === kind)?.variants[0]?.style.height || undefined;
  sizeOf("Sidebar width", (d) => regionOf(d, "sidebar")?.width, "width of the sidebar");
  sizeOf("Top bar height", (d) => regionOf(d, "top bar")?.height, "height of the top bar");
  sizeOf("Button height", variantHeight("button"), "height of the most common button");
  sizeOf("Input height", variantHeight("input"), "height of text inputs");
  sizeOf("Table row height", variantHeight("table_row"), "height of table rows");
  sizeOf("Navigation item height", variantHeight("nav_item"), "height of menu items");
  const icon = ranked(sum(screens, (d) => d.icon_sizes))[0];
  if (icon)
    token(
      "size",
      "Icon size",
      icon[0],
      `most common icon size (${plural(icon[1].count, "icon")})`,
      icon[1].screens,
    );
  const widths = ranked(
    sum(screens, (d) => (d.viewport.width ? [{ value: `${d.viewport.width}px`, count: 1 }] : [])),
  );
  if (widths[0])
    token(
      "breakpoint",
      "Captured window width",
      widths[0][0],
      "the window width the screens were measured at; other widths were not seen",
      widths[0][1].screens,
    );

  return { tokens, patterns: inferPatterns(screens) };
}

function inferPatterns(screens: Array<{ id: string; d: DesignSnapshot }>): UxPattern[] {
  const patterns: UxPattern[] = [];
  const add = (p: Omit<UxPattern, "id">) => {
    const id = nodeIdFor("ux_pattern", p.name);
    if (!patterns.some((x) => x.id === id)) patterns.push({ id, ...p });
  };

  // The app shell: the regions most screens share.
  const shell = screens.filter(({ d }) => regionOf(d, "sidebar") || regionOf(d, "top bar"));
  if (shell.length) {
    const first = shell[0]!.d;
    const side = regionOf(first, "sidebar");
    const bar = regionOf(first, "top bar");
    add({
      name: "App shell",
      kind: "layout",
      anatomy: [
        side
          ? `sidebar ${side.width}px wide on the ${side.x > first.viewport.width / 2 ? "right" : "left"}${side.background ? `, background ${side.background}` : ""}${side.position === "fixed" || side.position === "sticky" ? `, ${side.position}` : ""}`
          : "",
        bar
          ? `top bar ${bar.height}px high${bar.background ? `, background ${bar.background}` : ""}${bar.position === "fixed" || bar.position === "sticky" ? `, ${bar.position}` : ""}`
          : "",
        regionOf(first, "main")
          ? `main area ${regionOf(first, "main")!.width}px wide`
          : "main area fills the rest",
      ]
        .filter(Boolean)
        .join("; "),
      variants: [],
      states: [],
      screens: shell.map((s) => s.id),
    });
  }

  // Each kind of component, with its variants and visible states.
  const kinds = new Map<string, Array<{ id: string; c: ComponentLook }>>();
  for (const { id, d } of screens) {
    for (const c of d.components) kinds.set(c.kind, [...(kinds.get(c.kind) ?? []), { id, c }]);
  }
  for (const [kind, seen] of kinds) {
    const info = COMPONENTS[kind] ?? { name: kind, kind: "component" as const };
    const variants = new Map<string, { count: number; style: Look }>();
    for (const { c } of seen) {
      for (const v of c.variants) {
        const key = describeLook(v.style);
        const e = variants.get(key) ?? { count: 0, style: v.style };
        e.count += v.count;
        variants.set(key, e);
      }
    }
    const top = [...variants.values()].sort((a, b) => b.count - a.count).slice(0, 4);
    const base = top[0]?.style;
    const states = new Map<string, string>();
    for (const { c } of seen) {
      for (const s of c.states) {
        if (!states.has(s.state))
          states.set(s.state, describeLook(s.style, base) || "looks the same as default");
      }
    }
    add({
      name: info.name,
      kind: info.kind,
      anatomy: base
        ? `${describeLook(base)}${base.width && kind !== "button" && kind !== "badge" ? `, width ${base.width}px` : ""}`
        : "",
      variants: top.map(
        (v, i) =>
          `${i === 0 ? "most common" : `variant ${i + 1}`}: ${describeLook(v.style, i ? base : undefined) || "same look"} (${v.count} seen)`,
      ),
      states: ["default", ...[...states].map(([s, how]) => `${s.replace(/_/g, " ")}: ${how}`)],
      screens: [...new Set(seen.map((s) => s.id))],
    });
  }

  // Screen states seen.
  const STATE_PATTERNS: Record<string, { name: string; kind: UxPattern["kind"]; anatomy: string }> =
    {
      empty: {
        name: "Empty state",
        kind: "state",
        anatomy: "a message and usually a first action where a list would be",
      },
      loading: {
        name: "Loading state",
        kind: "state",
        anatomy: "a spinner, skeleton or progress bar while content loads",
      },
      error: {
        name: "Error message",
        kind: "feedback",
        anatomy: "an alert that says what went wrong",
      },
    };
  for (const [state, p] of Object.entries(STATE_PATTERNS)) {
    const on = screens.filter(({ d }) => d.states.includes(state)).map((s) => s.id);
    if (on.length) add({ ...p, variants: [], states: [], screens: on });
  }
  return patterns;
}

/** The design model as Markdown for the feature-model notes. */
export function designNotes(model: DesignModel): string {
  if (!model.tokens.length && !model.patterns.length) return "";
  const out = ["", "## Design and UX (measured)", ""];
  out.push(
    "Measured from the computed styles of the captured screens (no code, logos, icons or text copied). " +
      "Hover, focus and pressed states need interaction, which capture never does: check them by hand.",
    "",
  );
  for (const t of model.tokens)
    out.push(`- **${t.name}** (${t.category}): \`${t.value}\`, ${t.usage} [${t.id}]`);
  out.push("");
  for (const p of model.patterns) {
    out.push(`- **${p.name}** (${p.kind}) [${p.id}]${p.anatomy ? `: ${p.anatomy}` : ""}`);
    for (const v of p.variants) out.push(`  - ${v}`);
    if (p.states.length > 1) out.push(`  - States: ${p.states.join("; ")}`);
  }
  return out.join("\n") + "\n";
}
