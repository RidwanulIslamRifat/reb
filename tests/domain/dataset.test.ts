import { describe, expect, it } from "vitest";
import {
  buildDataset,
  CATEGORIES,
  isSyntheticValue,
  looksReal,
  toCsv,
} from "../../src/domain/dataset.js";

describe("make_test_dataset rules", () => {
  it.each(CATEGORIES)("%s data contains only synthetic values", (category) => {
    const { tables, warnings } = buildDataset({
      category,
      rows: 50,
      dataObjects: [{ id: "data_object-invoice", name: "Invoice" }],
    });
    expect(warnings).toEqual([]);
    expect(tables.length).toBeGreaterThanOrEqual(3);
    for (const table of tables) {
      expect(table.rows).toHaveLength(50);
      for (const value of table.rows.flatMap((r) => Object.values(r))) {
        expect(isSyntheticValue(value), `${table.name}: ${value}`).toBe(true);
        expect(looksReal(value), `${table.name}: ${value}`).toBe(false);
      }
    }
  });

  it("is different per category", () => {
    const names = (category: string) => buildDataset({ category }).tables.map((t) => t.name);
    expect(names("marketplace")).toEqual(["buyers", "sellers", "listings", "orders"]);
    expect(names("developer-tool")).toContain("repositories");
    expect(names("ai-tool")).toContain("prompts");
  });

  it("adds a table per data object and falls back to b2b-saas with a warning", () => {
    const result = buildDataset({
      category: "",
      dataObjects: [{ id: "data_object-invoice", name: "Invoice" }],
      rows: 2,
    });
    expect(result.category).toBe("b2b-saas");
    expect(result.warnings[0]).toContain("no category");
    const invoice = result.tables.find((t) => t.name === "invoice")!;
    expect(invoice.rows[1]).toEqual({
      name: "Test Invoice 02",
      created_by: "test.user02@example.com",
      created_on: "2026-01-02",
    });
  });

  it("flags values that look real", () => {
    for (const real of [
      "Jane Smith",
      "jane@gmail.com",
      "4111 1111 1111 1111",
      "123-45-6789",
      "+44 20 7946 0000",
    ]) {
      expect(isSyntheticValue(real) && !looksReal(real), real).toBe(false);
    }
  });

  it("writes CSV with quoted commas", () => {
    expect(toCsv({ name: "t", description: "", rows: [{ a: "x, y", b: 'say "hi"' }] })).toBe(
      'a,b\n"x, y","say ""hi"""\n',
    );
  });
});
