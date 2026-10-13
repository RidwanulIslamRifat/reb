import { describe, expect, it } from "vitest";
import {
  inboxKind,
  nodeFromFileName,
  parseNotes,
  sessionName,
  sessionNumber,
} from "../../src/domain/inbox.js";

describe("inbox rules", () => {
  it("names sessions session-01, session-02 ...", () => {
    expect(sessionName(1)).toBe("session-01");
    expect(sessionName(12)).toBe("session-12");
    expect(sessionNumber("session-07")).toBe(7);
    expect(sessionNumber("misc")).toBeNull();
  });

  it("knows screenshots, notes and HAR files, and ignores the rest", () => {
    expect(inboxKind("a.PNG")).toBe("screenshot");
    expect(inboxKind("shot.jpeg")).toBe("screenshot");
    expect(inboxKind("notes.md")).toBe("note");
    expect(inboxKind("notes.txt")).toBe("note");
    expect(inboxKind("network.har")).toBe("har");
    expect(inboxKind("video.mp4")).toBeNull();
    expect(inboxKind(".DS_Store")).toBeNull();
  });

  it("reads the node from a file name", () => {
    expect(nodeFromFileName("feature-export--1.png")).toBe("feature-export");
    expect(nodeFromFileName("pricing_tier-business.png")).toBe("pricing_tier-business");
    expect(nodeFromFileName("screenshot 1.png")).toBeNull();
    expect(nodeFromFileName("thing-export.png")).toBeNull();
  });

  it("splits notes into one finding per bullet with its nodes and screenshots", () => {
    const entries = parseNotes(
      [
        "# Notes",
        "- [feature-export] Export is under Settings.",
        "  It took two clicks. See export.png",
        "* [question-formats] [feature-export] Only CSV.",
        "1. No node here",
        "- [not a node] stays as text",
      ].join("\n"),
    );
    expect(entries).toEqual([
      {
        text: "Export is under Settings. It took two clicks. See export.png",
        nodes: ["feature-export"],
        files: ["export.png"],
      },
      { text: "Only CSV.", nodes: ["question-formats", "feature-export"], files: [] },
      { text: "No node here", nodes: [], files: [] },
      { text: "[not a node] stays as text", nodes: [], files: [] },
    ]);
  });

  it("treats a notes file without bullets as one finding", () => {
    expect(parseNotes("# Title\n[journey-onboarding] Sign-up has\nfour steps.\n")).toEqual([
      { text: "Sign-up has four steps.", nodes: ["journey-onboarding"], files: [] },
    ]);
    expect(parseNotes("# only a heading\n\n")).toEqual([]);
  });
});
