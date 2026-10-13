import { describe, expect, it } from "vitest";
import { RebError } from "../src/domain/errors.js";

describe("RebError", () => {
  it("formats a problem line and a fix line", () => {
    const error = new RebError(
      "The runs folder is not writable.",
      "Set REB_HOME to a folder you own.",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.format()).toBe(
      "Problem: The runs folder is not writable.\nFix: Set REB_HOME to a folder you own.",
    );
  });
});
