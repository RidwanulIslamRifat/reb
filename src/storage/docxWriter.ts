import { crc32, deflateRawSync } from "node:zlib";

/**
 * A small Markdown -> Word (.docx) writer for reports (SPEC 11), with no extra library.
 * It understands what render_report writes: headings (#, ##, ###), paragraphs, bullet lists
 * (two spaces of indent per level), tables, **bold**, _italic_, `code` and [text](url) links.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; level: number; text: string }
  | { kind: "table"; rows: string[][] };

const SEPARATOR = /^\|?[\s:|-]*-[\s:|-]*\|?$/;

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function markdownBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let table: string[][] | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    if (table) blocks.push({ kind: "table", rows: table });
    paragraph = [];
    table = null;
  };
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const text = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(text);
    const bullet = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (!text) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: "heading", level: Math.min(heading[1]!.length, 3), text: heading[2]! });
    } else if (text.startsWith("|")) {
      if (paragraph.length) flush();
      if (!SEPARATOR.test(text)) (table ??= []).push(cells(text));
    } else if (bullet) {
      flush();
      const level = Math.min(Math.floor(bullet[1]!.length / 2), 2);
      blocks.push({ kind: "bullet", level, text: bullet[3]! });
    } else if (blocks.at(-1)?.kind === "bullet" && /^\s/.test(raw) && !paragraph.length) {
      (blocks.at(-1) as { text: string }).text += ` ${text}`;
    } else {
      if (table) flush();
      paragraph.push(text);
    }
  }
  flush();
  return blocks;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Word runs for a line of Markdown with **bold**, _italic_ / *italic* and `code`. */
function runs(text: string): string {
  const plain = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  const out: string[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|(?<![\w])_[^_]+_(?![\w])|(?<![\w*])\*[^*]+\*(?![\w*]))/g;
  let last = 0;
  const run = (t: string, props = "") =>
    t &&
    out.push(
      `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`,
    );
  for (const m of plain.matchAll(pattern)) {
    run(plain.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) run(token.slice(2, -2), "<w:b/>");
    else if (token.startsWith("`"))
      run(token.slice(1, -1), '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
    else run(token.slice(1, -1), "<w:i/>");
    last = m.index + token.length;
  }
  run(plain.slice(last));
  return out.join("");
}

const para = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${runs(text)}</w:p>`;

function documentXml(blocks: Block[]): string {
  const body = blocks.map((b) => {
    switch (b.kind) {
      case "heading":
        return para(b.text, `Heading${b.level}`);
      case "paragraph":
        return para(b.text);
      case "bullet":
        return para(`• ${b.text}`, `ListBullet${b.level + 1}`);
      case "table": {
        const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:color="999999"/>`;
        const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
          .map(border)
          .join("");
        const rows = b.rows
          .map(
            (row, i) =>
              `<w:tr>${row
                .map((c) => `<w:tc><w:p>${runs(i === 0 ? `**${c}**` : c)}</w:p></w:tc>`)
                .join("")}</w:tr>`,
          )
          .join("");
        return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>${rows}</w:tbl><w:p/>`;
      }
    }
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body.join("") +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
    "</w:body></w:document>"
  );
}

function stylesXml(): string {
  const heading = (n: number, size: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const bullet = (n: number) =>
    `<w:style w:type="paragraph" w:styleId="ListBullet${n}"><w:name w:val="List Bullet ${n}"/><w:basedOn w:val="Normal"/>` +
    `<w:pPr><w:spacing w:after="60"/><w:ind w:left="${360 * n}" w:hanging="240"/></w:pPr></w:style>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    heading(1, 36) +
    heading(2, 28) +
    heading(3, 24) +
    bullet(1) +
    bullet(2) +
    bullet(3) +
    "</w:styles>"
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOCUMENT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

/** A zip file (deflate) of the given files. Times are fixed, so the same input gives the same bytes. */
export function zip(files: Array<{ name: string; data: string }>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.data, "utf8");
    const packed = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** The bytes of a .docx file with the content of a Markdown report. */
export function markdownToDocx(markdown: string): Buffer {
  return zip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: ROOT_RELS },
    { name: "word/_rels/document.xml.rels", data: DOCUMENT_RELS },
    { name: "word/document.xml", data: documentXml(markdownBlocks(markdown)) },
    { name: "word/styles.xml", data: stylesXml() },
  ]);
}
