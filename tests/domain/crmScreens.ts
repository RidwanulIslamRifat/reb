import {
  screenDetail,
  screenHints,
  type CapturedScreen,
  type PageSnapshot,
} from "../../src/domain/capture.js";

/** A made-up CRM (like HubSpot or Salesforce), as reb capture would read it: path -> snapshot. */
const NAV = ["Contacts", "Companies", "Deals", "Reports", "Workflows", "Settings"];
const SNAPS: Record<string, Omit<PageSnapshot, "url" | "links"> & { links_to: string[] }> = {
  "/contacts": {
    title: "Contacts | Acme CRM",
    headings: ["Contacts"],
    buttons: ["Create contact", "Import", "Export", "Filters", "Edit columns"],
    fields: ["Search contacts"],
    columns: [
      "Name",
      "Email",
      "Phone number",
      "Company",
      "Contact owner",
      "Lead status",
      "Create date",
    ],
    form_fields: [{ label: "Search contacts", kind: "search", required: false, options: [] }],
    values: [
      { column: "Lead status", values: ["New", "Open", "In progress", "Unqualified", "New"] },
      { column: "Name", values: ["Jane Roe", "John Doe"] },
    ],
    nav: NAV,
    controls: ["search", "filter", "sort", "pagination", "bulk_select", "views"],
    links_to: ["screen-contacts-detail", "screen-companies"],
  },
  "/contacts/:id": {
    title: "Jane Roe | Acme CRM",
    headings: ["Jane Roe", "About this contact", "Deals", "Activity"],
    buttons: ["Edit", "Log activity", "Send email", "Delete"],
    fields: [],
    columns: [],
    form_fields: [
      { label: "First name", kind: "text", required: true, options: [] },
      { label: "Email", kind: "email", required: true, options: [] },
      { label: "Job title", kind: "text", required: false, options: [] },
      {
        label: "Lifecycle stage",
        kind: "select",
        required: false,
        options: ["Subscriber", "Lead", "Customer"],
      },
      {
        label: "Contact owner",
        kind: "select",
        required: false,
        options: ["Jane Roe", "John Doe"],
      },
    ],
    tabs: ["Overview", "Activities", "Deals"],
    nav: NAV,
    links_to: ["screen-companies-detail"],
  },
  "/companies": {
    title: "Companies | Acme CRM",
    headings: ["Companies"],
    buttons: ["Create company", "Filters"],
    fields: [],
    columns: ["Company name", "Domain", "Industry", "Number of employees", "Company owner"],
    nav: NAV,
    controls: ["search", "filter", "pagination"],
    links_to: ["screen-companies-detail"],
  },
  "/companies/:id": {
    title: "Globex | Acme CRM",
    headings: ["Globex", "Contacts", "Deals"],
    buttons: ["Edit"],
    fields: [],
    columns: [],
    tabs: ["Overview", "Contacts", "Deals"],
    nav: NAV,
    links_to: [],
  },
  "/deals": {
    title: "Deals | Acme CRM",
    headings: ["Deals"],
    buttons: ["Create deal", "Board view"],
    fields: [],
    columns: ["Deal name", "Amount", "Deal stage", "Close date", "Company", "Deal owner"],
    values: [
      {
        column: "Deal stage",
        values: ["Appointment scheduled", "Qualified", "Proposal", "Closed won", "Closed lost"],
      },
    ],
    nav: NAV,
    controls: ["filter", "pagination", "views"],
    links_to: [],
  },
  "/reports/dashboard": {
    title: "Sales dashboard | Acme CRM",
    headings: ["Sales dashboard", "Deals won this month", "Deals by stage"],
    buttons: ["Add report", "Share"],
    fields: [],
    columns: [],
    charts: 3,
    nav: NAV,
    controls: ["date_range"],
    links_to: [],
  },
  "/workflows": {
    title: "Workflows | Acme CRM",
    headings: ["Workflows"],
    buttons: ["Create workflow"],
    fields: [],
    columns: ["Name", "Enrolled", "Status", "Last updated"],
    nav: NAV,
    links_to: [],
  },
  "/settings/users": {
    title: "Users & Teams | Acme CRM",
    headings: ["Users & Teams"],
    buttons: ["Invite user"],
    fields: [],
    columns: ["Name", "Email", "Role", "Last active"],
    values: [{ column: "Role", values: ["Super admin", "Sales rep", "Viewer"] }],
    notices: ["8 of 10 paid seats used. Upgrade to add more."],
    nav: NAV,
    links_to: [],
  },
  "/settings/properties": {
    title: "Properties | Acme CRM",
    headings: ["Properties"],
    buttons: ["Create property"],
    fields: [],
    columns: ["Name", "Field type", "Group"],
    nav: NAV,
    links_to: [],
  },
  "/settings/integrations": {
    title: "Connected apps | Acme CRM",
    headings: ["Connected apps"],
    buttons: ["Visit marketplace"],
    fields: [],
    columns: [],
    nav: NAV,
    links_to: [],
  },
};

const idOf = (pattern: string) =>
  "screen-" +
  pattern
    .replace(/:id/g, "detail")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function crmScreens(): CapturedScreen[] {
  return Object.entries(SNAPS).map(([pattern, snap]) => {
    const { links_to, ...rest } = snap;
    const base = {
      id: idOf(pattern),
      name: rest.headings[0]!,
      url: pattern,
      pattern,
      depth: 1,
      file: `${idOf(pattern)}.png`,
      title: rest.title,
      headings: rest.headings,
      buttons: rest.buttons,
      fields: rest.fields,
      columns: rest.columns,
      ...screenDetail({ ...rest, url: pattern, links: [] }),
    };
    return { ...base, links_to, hints: screenHints(base) };
  });
}
