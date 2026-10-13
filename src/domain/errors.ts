/**
 * The one error type reb shows to people (SPEC 14).
 * Every expected failure says what went wrong and how to fix it.
 */
export class RebError extends Error {
  readonly problem: string;
  readonly fix: string;

  constructor(problem: string, fix: string) {
    super(problem);
    this.name = "RebError";
    this.problem = problem;
    this.fix = fix;
  }

  format(): string {
    return `Problem: ${this.problem}\nFix: ${this.fix}`;
  }
}
