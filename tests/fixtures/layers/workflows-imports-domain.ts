// Allowed: workflows may import domain (SPEC 4).
import { RebError } from "../domain/errors.js";

export const error = new RebError("problem", "fix");
