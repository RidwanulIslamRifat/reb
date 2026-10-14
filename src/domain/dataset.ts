/**
 * make_test_dataset (SPEC 9, ROADMAP decision 16): small, obviously fake data the human types or
 * uploads by hand in their own session. Every value is fictional: "Test ..." names, example.com
 * emails, 555-01xx phone numbers, round dates and prices. Never real personal data.
 */

export const CATEGORIES = [
  "b2b-saas",
  "developer-tool",
  "marketplace",
  "consumer-app",
  "ai-tool",
  "ecommerce",
  "fintech",
  "service-business",
  "general-business",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Row = Record<string, string>;
export interface Table {
  name: string;
  description: string;
  rows: Row[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const pick = <T>(list: readonly T[], i: number) => list[(i - 1) % list.length]!;

const person = (i: number) => ({
  name: `Test User ${pad(i)}`,
  email: `test.user${pad(i)}@example.com`,
});
const phone = (i: number) => `+1 555 01${pad(i % 100)}`;
const day = (i: number) => `2026-01-${pad(((i - 1) % 28) + 1)}`;
const price = (i: number) => `${(i * 5 - 0.01).toFixed(2)}`;

type Maker = (i: number) => Row;
const TABLES: Record<Category, Array<{ name: string; description: string; make: Maker }>> = {
  "b2b-saas": [
    {
      name: "users",
      description: "Team members to invite.",
      make: (i) => ({
        ...person(i),
        role: pick(["admin", "member", "viewer"], i),
        team: `Test Team ${pad(Math.ceil(i / 3))}`,
      }),
    },
    {
      name: "companies",
      description: "Customer or workspace companies.",
      make: (i) => ({
        name: `Example Company ${pad(i)}`,
        website: `https://company${pad(i)}.example.com`,
        size: pick(["1-10", "11-50", "51-200"], i),
        phone: phone(i),
      }),
    },
    {
      name: "projects",
      description: "Projects or records to create.",
      make: (i) => ({
        name: `Test Project ${pad(i)}`,
        owner_email: person(i).email,
        status: pick(["planned", "active", "done"], i),
        due_date: day(i),
      }),
    },
  ],
  "developer-tool": [
    {
      name: "users",
      description: "Developer accounts to invite.",
      make: (i) => ({ ...person(i), role: pick(["owner", "developer", "viewer"], i) }),
    },
    {
      name: "repositories",
      description: "Sample projects or repositories to connect or create.",
      make: (i) => ({
        name: `test-repo-${pad(i)}`,
        language: pick(["typescript", "python", "go"], i),
        visibility: "private",
        url: `https://git.example.com/test-org/test-repo-${pad(i)}`,
      }),
    },
    {
      name: "environments",
      description: "Deployment targets or environments.",
      make: (i) => ({
        name: `test-env-${pad(i)}`,
        url: `https://env${pad(i)}.example.com`,
        region: pick(["test-region-1", "test-region-2"], i),
      }),
    },
  ],
  marketplace: [
    {
      name: "buyers",
      description: "Buyer profiles.",
      make: (i) => ({ ...person(i), city: `Testville ${pad(i)}`, phone: phone(i) }),
    },
    {
      name: "sellers",
      description: "Seller or shop profiles.",
      make: (i) => ({
        shop_name: `Example Shop ${pad(i)}`,
        contact_email: `test.seller${pad(i)}@example.com`,
        address: `${i} Example Street, Testville`,
      }),
    },
    {
      name: "listings",
      description: "Items or services to list.",
      make: (i) => ({
        title: `Test Item ${pad(i)}`,
        category: pick(["test-category-a", "test-category-b"], i),
        price: price(i),
        currency: "USD",
      }),
    },
    {
      name: "orders",
      description: "Orders to place (stop before any real payment).",
      make: (i) => ({
        order_ref: `TEST-ORDER-${pad(i)}`,
        buyer_email: person(i).email,
        item: `Test Item ${pad(i)}`,
        quantity: String(((i - 1) % 3) + 1),
      }),
    },
  ],
  "consumer-app": [
    {
      name: "profiles",
      description: "Profiles to create.",
      make: (i) => ({
        display_name: `Test User ${pad(i)}`,
        email: person(i).email,
        city: `Testville ${pad(i)}`,
      }),
    },
    {
      name: "posts",
      description: "Posts, lists or entries to add.",
      make: (i) => ({
        title: `Test Post ${pad(i)}`,
        text: `Sample text ${pad(i)} about a fictional day in Testville.`,
        posted_on: day(i),
      }),
    },
  ],
  "ai-tool": [
    {
      name: "users",
      description: "Accounts to invite.",
      make: (i) => ({ ...person(i), role: pick(["admin", "member"], i) }),
    },
    {
      name: "prompts",
      description: "Prompts to try.",
      make: (i) =>
        ({
          prompt: pick(
            [
              "Sample prompt: summarise the fictional Test Bakery menu in three bullet points.",
              "Sample prompt: write a short welcome email for Test User 01.",
              "Sample prompt: list five fictional names for a test project.",
            ],
            i,
          ),
          expected: "Sample answer that mentions only the fictional names given.",
        }) as Row,
    },
    {
      name: "documents",
      description: "Small documents to upload.",
      make: (i) => ({
        title: `Sample Document ${pad(i)}`,
        text: `Sample text ${pad(i)}: the fictional Test Bakery opens at 8 and sells test bread.`,
      }),
    },
  ],
  ecommerce: [
    {
      name: "shoppers",
      description: "Shopper accounts to create.",
      make: (i) => ({ ...person(i), address: `${i} Example Street, Testville`, phone: phone(i) }),
    },
    {
      name: "cart_items",
      description: "Items to search for and add to the cart (stop before any real payment).",
      make: (i) => ({
        search: pick(["Test Mug", "Test T-shirt", "Test Notebook"], i),
        quantity: String(((i - 1) % 3) + 1),
        size_or_option: pick(["small", "medium", "large"], i),
      }),
    },
  ],
  fintech: [
    {
      name: "contacts",
      description: "Payees, customers or contacts to add (never real bank details).",
      make: (i) => ({
        name: `Example Company ${pad(i)}`,
        email: `test.billing${pad(i)}@example.com`,
        account_note: "Test account, no real bank details",
      }),
    },
    {
      name: "invoices",
      description:
        "Invoices, payment requests or transactions to draft (stop before moving real money).",
      make: (i) => ({
        reference: `TEST-INV-${pad(i)}`,
        amount: price(i),
        currency: "USD",
        due_date: day(i),
      }),
    },
  ],
  "service-business": [
    {
      name: "clients",
      description: "Client companies to mention in a request.",
      make: (i) => ({
        name: `Example Company ${pad(i)}`,
        website: `https://company${pad(i)}.example.com`,
        size: pick(["1-10", "11-50", "51-200"], i),
      }),
    },
    {
      name: "enquiries",
      description: "Quote or booking requests to fill in (stop before submitting).",
      make: (i) => ({
        ...person(i),
        service: pick(["Test consultation", "Test audit", "Test workshop"], i),
        preferred_date: day(i),
        message: `Sample request ${pad(i)} from a fictional client.`,
      }),
    },
  ],
  "general-business": [
    {
      name: "contacts",
      description: "Contact or sign-up details to type (stop before submitting real data).",
      make: (i) => ({ ...person(i), company: `Example Company ${pad(i)}`, phone: phone(i) }),
    },
    {
      name: "orders",
      description: "Products or services to choose (stop before any real payment).",
      make: (i) => ({ item: `Test Item ${pad(i)}`, quantity: String(((i - 1) % 3) + 1) }),
    },
  ],
};

function kebab(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The tables for a category, plus one table for each data object the graph knows
 * (for example "Invoice" gives an "invoice" table of Test Invoice 01 ...).
 */
export function buildDataset(input: {
  category: string;
  dataObjects?: Array<{ id: string; name: string }>;
  rows?: number;
}): { category: Category; tables: Table[]; warnings: string[] } {
  const rows = Math.min(Math.max(input.rows ?? 5, 1), 50);
  const warnings: string[] = [];
  const known = (CATEGORIES as readonly string[]).includes(input.category);
  const category = (known ? input.category : "b2b-saas") as Category;
  if (!known) {
    warnings.push(
      `brief.md has ${input.category ? `category "${input.category}"` : "no category"}; ` +
        `using b2b-saas sample data. Set category to one of: ${CATEGORIES.join(", ")}.`,
    );
  }
  const range = Array.from({ length: rows }, (_, i) => i + 1);
  const tables: Table[] = TABLES[category].map((t) => ({
    name: t.name,
    description: t.description,
    rows: range.map(t.make),
  }));
  const taken = new Set(tables.map((t) => t.name));
  for (const object of input.dataObjects ?? []) {
    const name = kebab(object.name);
    if (!name || taken.has(name)) continue;
    taken.add(name);
    const title = object.name.replace(/[^A-Za-z0-9 ]+/g, " ").trim();
    tables.push({
      name,
      description: `Sample ${object.name} records (from ${object.id}).`,
      rows: range.map((i) => ({
        name: `Test ${title} ${pad(i)}`,
        created_by: person(i).email,
        created_on: day(i),
      })),
    });
  }
  return { category, tables, warnings };
}

/**
 * Patterns every dataset value must match, so a test (and a careful reader) can see that the data
 * is synthetic: fake names, reserved example domains, 555-01xx phones, plain numbers, dates and
 * short labels.
 */
export const SYNTHETIC_PATTERNS: RegExp[] = [
  /^(Test|Example|Sample|Fake)\b/,
  /^test[.-][a-z0-9.-]*@example\.com$/,
  /^https:\/\/([a-z0-9-]+\.)*example\.com(\/[\w./-]*)?$/,
  /^\+1 555 01\d{2}$/,
  /^\d+(\.\d{2})?$/,
  /^\d+-\d+$/,
  /^\d{4}-\d{2}-\d{2}$/,
  /^TEST-[A-Z]+-\d+$/,
  /^\d+ Example Street, Testville$/,
  /^Testville \d+$/,
  /^(test-[a-z0-9-]+|[a-z]+|USD)$/,
];

export function isSyntheticValue(value: string): boolean {
  return SYNTHETIC_PATTERNS.some((p) => p.test(value));
}

/** Values that look real (card numbers, national ids, emails outside example.com). */
export function looksReal(value: string): boolean {
  return (
    /\b\d{13,19}\b/.test(value.replace(/[ -]/g, "")) ||
    /\b\d{3}-\d{2}-\d{4}\b/.test(value) ||
    /@(?!example\.com\b)[a-z0-9-]+\.[a-z]{2,}/i.test(value)
  );
}

/** A table as CSV, quoting values that hold commas, quotes or line breaks. */
export function toCsv(table: Table): string {
  const columns = Object.keys(table.rows[0] ?? {});
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    columns.join(","),
    ...table.rows.map((r) => columns.map((c) => cell(r[c] ?? "")).join(",")),
  ]
    .join("\n")
    .concat("\n");
}
