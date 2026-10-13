// Deliberately wrong: only storage touches files (SPEC 4).
import { readFileSync } from "node:fs";

export const read = readFileSync;
