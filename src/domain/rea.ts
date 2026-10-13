import type { Confidence } from "./evidence.js";

/**
 * The optional REA bridge (SPEC 4 sources, ROADMAP decision 14 as changed in M7).
 * REA (github.com/morluto/rea) is a separate MCP server. When the user has it, the tech_observer role
 * may call these passive REA tools itself, then store what they returned with record_rea_result.
 * Every other REA tool is refused, above all any tool that drives or automates a browser (SPEC 2.3).
 */
export const REA_PASSIVE_TOOLS = [
  "inspect_web_network_capture",
  "inspect_web_page",
  "analyze_web_bundle",
] as const;
export type ReaPassiveTool = (typeof REA_PASSIVE_TOOLS)[number];

export function isReaPassiveTool(name: string): name is ReaPassiveTool {
  return (REA_PASSIVE_TOOLS as readonly string[]).includes(name);
}

/**
 * The strongest label a result of each tool can carry. A network capture is the user's own
 * session (observed); a page inspection is what the public page states (documented); a bundle
 * analysis is reasoning about code (inferred).
 */
export const REA_MAX_CONFIDENCE: Record<ReaPassiveTool, Confidence> = {
  inspect_web_network_capture: "observed",
  inspect_web_page: "documented",
  analyze_web_bundle: "inferred",
};

/** What each tool reads, for the limitations of the evidence record. */
export const REA_LIMITATION: Record<ReaPassiveTool, string> = {
  inspect_web_network_capture:
    "From REA's reading of a network capture the user saved from their own session; secrets were stripped before storing.",
  inspect_web_page:
    "From REA's passive inspection of one public page; nothing was clicked or typed.",
  analyze_web_bundle:
    "From REA's static reading of public JavaScript bundles; what the code shows is a reasoned guess, not seen in use.",
};
