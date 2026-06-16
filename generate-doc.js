const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  PageOrientation, TabStopType, TabStopPosition, ExternalHyperlink,
  InternalHyperlink, Bookmark, LevelFormat, TableOfContents,
} = require("docx");
const fs = require("fs");

// Palette — Tech/Cool theme
const P = {
  primary: "#0B1220",
  body: "#182030",
  secondary: "#506070",
  accent: "#3B82F6",
  surface: "#F1F5F9",
  cover: { titleColor: "FFFFFF", subtitleColor: "CBD5E1", metaColor: "94A3B8", footerColor: "64748B", bg: "0F172A" },
};
const c = (hex) => hex.replace("#", "");

// Safe text helper
function safeText(value, placeholder) {
  if (value === undefined || value === null || value === "" || String(value) === "NaN" || String(value) === "undefined") {
    return placeholder || "\u3010Vui long dien\u3011";
  }
  return String(value);
}

// --- Component Builders ---

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100, line: 312 },
    children: [new TextRun({ text, bold: true, size: 24, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
  });
}

function bodyText(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })],
  });
}

function bodyTextNoIndent(text) {
  return new Paragraph({
    spacing: { line: 312, after: 80 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })],
  });
}

function boldBodyText(label, text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 480 },
    spacing: { line: 312, after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 24, color: c(P.primary), font: { ascii: "Times New Roman", eastAsia: "SimHei" } }),
      new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "SimSun" } }),
    ],
  });
}

function bulletItem(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { line: 312, after: 40 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })],
  });
}

function numberedItem(text, reference, level = 0) {
  return new Paragraph({
    numbering: { reference, level },
    spacing: { line: 312, after: 40 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })],
  });
}

function codeBlock(text) {
  return new Paragraph({
    spacing: { line: 276, before: 80, after: 80 },
    indent: { left: 480 },
    shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
    children: [new TextRun({ text, size: 20, color: "1E293B", font: { ascii: "Consolas", eastAsia: "Consolas" } })],
  });
}

function spacer(h = 120) {
  return new Paragraph({ spacing: { before: h } });
}

// Table builder helper
function makeTable(headers, rows, colWidths) {
  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: borderStyle, bottom: borderStyle,
      left: noBorder, right: noBorder,
      insideHorizontal: borderStyle, insideVertical: noBorder,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((h, i) =>
          new TableCell({
            width: { size: colWidths?.[i] || Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: "E2E8F0" },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 21, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "SimHei" } })] })],
          })
        ),
      }),
      ...rows.map(row =>
        new TableRow({
          cantSplit: true,
          children: row.map((cell, i) =>
            new TableCell({
              width: { size: colWidths?.[i] || Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
              margins: { top: 40, bottom: 40, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 21, color: c(P.body), font: { ascii: "Times New Roman", eastAsia: "SimSun" } })] })],
            })
          ),
        })
      ),
    ],
  });
}

// --- Numbering Config ---
const numberingConfig = [
  { reference: "num-setup", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  { reference: "num-search", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  { reference: "num-chat", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  { reference: "num-env", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  { reference: "num-arch", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
];

// ========================
// COVER SECTION (R1 - Pure Paragraph Left)
// ========================
const coverSection = {
  properties: {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    },
  },
  children: [
    // Full-height wrapper table
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        height: { value: 16838, rule: "exact" },
        children: [new TableCell({
          width: { size: 100, type: WidthType.PERCENTAGE },
          verticalAlign: "top",
          shading: { type: ShadingType.CLEAR, fill: c(P.cover.bg) },
          margins: { left: 1701, right: 1701 },
          borders: {
            top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          },
          children: [
            new Paragraph({ spacing: { before: 4800 } }),
            new Paragraph({
              spacing: { before: 200, after: 0, line: 920, lineRule: "atLeast" },
              children: [new TextRun({ text: "HERMES + VERCEL AI SDK", size: 72, bold: true, color: c(P.cover.titleColor), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
            }),
            new Paragraph({
              spacing: { before: 80, after: 0, line: 560, lineRule: "atLeast" },
              children: [new TextRun({ text: "Autonomous Agent Dashboard", size: 40, color: c(P.cover.subtitleColor), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
            }),
            new Paragraph({ spacing: { before: 600 } }),
            new Paragraph({
              children: [
                new TextRun({ text: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500", size: 20, color: "334155" }),
              ],
            }),
            new Paragraph({ spacing: { before: 300 } }),
            new Paragraph({
              spacing: { line: 400 },
              children: [new TextRun({ text: "T\u00e0i li\u1ec7u h\u01b0\u1edbng d\u1eabn quy tr\u00ecnh v\u00e0 th\u00f4ng tin ph\u1ea7n m\u1ec1m", size: 28, color: c(P.cover.subtitleColor), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
            }),
            new Paragraph({
              spacing: { before: 200, line: 400 },
              children: [new TextRun({ text: "Phi\u00ean b\u1ea3n 1.0 \u00B7 Th\u00e1ng 6/2026", size: 22, color: c(P.cover.metaColor), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
            }),
            new Paragraph({ spacing: { before: 3600 } }),
            new Paragraph({
              children: [new TextRun({ text: "Next.js 16 \u00B7 Vercel AI SDK \u00B7 Qwen 3.5 Flash \u00B7 Hermes Agent \u00B7 OpenStreetMap", size: 18, color: c(P.cover.footerColor), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
            }),
          ],
        })],
      })],
    }),
  ],
};

// ========================
// TOC SECTION
// ========================
const tocSection = {
  properties: {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
      pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
    },
  },
  headers: {
    default: new Header({
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Hermes + Vercel AI SDK \u2014 T\u00e0i li\u1ec7u h\u01b0\u1edbng d\u1eabn", size: 18, color: "94A3B8", font: { ascii: "Calibri", eastAsia: "SimHei" } })] })],
    }),
  },
  footers: {
    default: new Footer({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "94A3B8" })] })],
    }),
  },
  children: [
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: "M\u1ee5c l\u1ee5c", size: 36, bold: true, color: c(P.primary), font: { ascii: "Calibri", eastAsia: "SimHei" } })],
    }),
    new TableOfContents("M\u1ee5c l\u1ee5c", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({
      spacing: { before: 200, after: 100 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "(Nh\u1ea5p chu\u1ed9t ph\u1ea3i v\u00e0o m\u1ee5c l\u1ee5c \u2192 \u201cUpdate Field\u201d \u0111\u1ec3 c\u1eadp nh\u1eadt s\u1ed1 trang)", size: 18, italics: true, color: "94A3B8" })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ],
};

// ========================
// BODY SECTION
// ========================
const bodyChildren = [];

// === CHƯƠNG 1: TỔNG QUAN ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 1: T\u1ed5ng quan h\u1ec7 th\u1ed1ng"),

  heading2("1.1 Gi\u1edbi thi\u1ec7u"),
  bodyText("Hermes + Vercel AI SDK l\u00e0 m\u1ed9t h\u1ec7 th\u1ed1ng dashboard t\u1ef1 ch\u1ee7 (Autonomous Agent Dashboard) k\u1ebft h\u1ee3p gi\u1eefa Vercel AI SDK v\u00e0 Hermes Agent, cung c\u1ea5p giao di\u1ec7n web hi\u1ec7n \u0111\u1ea1i \u0111\u1ec3 t\u01b0\u01a1ng t\u00e1c v\u1edbi c\u00e1c m\u00f4 h\u00ecnh AI l\u1edbn th\u00f4ng qua c\u01a1 ch\u1ebf streaming th\u1ef1c t\u1ebf. H\u1ec7 th\u1ed1ng cho ph\u00e9p ng\u01b0\u1eddi d\u00f9ng tr\u00f2 chuy\u1ec7n v\u1edbi AI, t\u00ecm ki\u1ebfm th\u00f4ng tin th\u00f4ng minh ki\u1ec3u Perplexity, kh\u00e1m ph\u00e1 \u0111\u1ecba \u0111i\u1ec3m tr\u00ean b\u1ea3n \u0111\u1ed3 v\u00e0 qu\u1ea3n l\u00fd phi\u00ean l\u00e0m vi\u1ec7c v\u1edbi agent t\u1ef1 tr\u1ecb c\u00f3 tr\u00ed nh\u1edb b\u1ec1n v\u1eefng."),
  bodyText("D\u1ef1 \u00e1n \u0111\u01b0\u1ee3c x\u00e2y d\u1ef1ng tr\u00ean n\u1ec1n t\u1ea3ng Next.js 16 v\u1edbi App Router, s\u1eed d\u1ee5ng Vercel AI SDK \u0111\u1ec3 qu\u1ea3n l\u00fd streaming v\u00e0 k\u1ebft n\u1ed1i \u0111a model, t\u00edch h\u1ee3p hai nh\u00e0 cung c\u1ea5p LLM ch\u00ednh l\u00e0 Qwen 3.5 Flash (Alibaba Cloud) v\u00e0 Hermes Agent (Nous Research). Giao di\u1ec7n ng\u01b0\u1eddi d\u00f9ng s\u1eed d\u1ee5ng shadcn/ui v\u1edbi Framer Motion \u0111\u1ec3 t\u1ea1o tr\u1ea3i nghi\u1ec7m m\u01b0\u1ee3t m\u00e0, v\u00e0 Leaflet/OpenStreetMap \u0111\u1ec3 hi\u1ec3n th\u1ecb b\u1ea3n \u0111\u1ed3 mi\u1ec5n ph\u00ed kh\u00f4ng c\u1ea7n API key."),

  heading2("1.2 C\u00f4ng ngh\u1ec7 s\u1eed d\u1ee5ng"),
  makeTable(
    ["C\u00f4ng ngh\u1ec7", "Phi\u00ean b\u1ea3n", "Vai tr\u00f2"],
    [
      ["Next.js", "16.1.1", "Framework fullstack, App Router, SSR"],
      ["React", "19.0", "Th\u01b0 vi\u1ec7n UI, hooks, components"],
      ["Vercel AI SDK", "6.0+", "Streaming chat, useChat, streamText"],
      ["@ai-sdk/openai", "3.0+", "OpenAI-compatible provider cho Qwen & Hermes"],
      ["Qwen 3.5 Flash", "Latest", "M\u00f4 h\u00ecnh AI nhanh t\u1eeb Alibaba Cloud (DashScope)"],
      ["Hermes Agent", "Latest", "Agent t\u1ef1 tr\u1ecb c\u00f3 tr\u00ed nh\u1edb, MCP server"],
      ["Leaflet + react-leaflet", "5.0", "B\u1ea3n \u0111\u1ed3 t\u01b0\u01a1ng t\u00e1c OpenStreetMap"],
      ["shadcn/ui + Radix", "Latest", "Component UI v\u1edbi accessibility"],
      ["Framer Motion", "12+", "Animation v\u00e0 transition m\u01b0\u1ee3t m\u00e0"],
      ["Prisma + SQLite", "6.11", "ORM v\u00e0 c\u01a1 s\u1edf d\u1eef li\u1ec7u c\u1ee5c b\u1ed9"],
      ["z-ai-web-dev-sdk", "0.0.17+", "Web search v\u00e0 web reader"],
      ["Tailwind CSS", "4.0", "Utility-first CSS framework"],
    ],
    [30, 15, 55],
  ),

  heading2("1.3 Ki\u1ebfn tr\u00fac h\u1ec7 th\u1ed1ng"),
  bodyText("H\u1ec7 th\u1ed1ng \u0111\u01b0\u1ee3c thi\u1ebft k\u1ebf theo ki\u1ebfn tr\u00fac 3 l\u1edbp (three-tier architecture): Frontend (Next.js App Router), Backend API Routes (serverless functions), v\u00e0 External Services (Qwen, Hermes, OpenStreetMap, Web Search). Giao ti\u1ebfp gi\u1eefa c\u00e1c l\u1edbp th\u1ef1c hi\u1ec7n qua REST API v\u00e0 OpenAI-compatible streaming protocol."),
  bodyText("L\u1edbp Frontend s\u1eed d\u1ee5ng React Server Components k\u1ebft h\u1ee3p Client Components cho t\u01b0\u01a1ng t\u00e1c th\u1ef1c t\u1ebf (chat, search, map). L\u1edbp Backend API cung c\u1ea5p c\u00e1c endpoint streaming cho chat, search v\u00e0 proxy cho Hermes Agent. L\u1edbp External Services bao g\u1ed3m Qwen 3.5 Flash qua DashScope, Hermes Agent qua OpenAI-compatible API, Nominatim/Overpass cho geocoding, v\u00e0 z-ai-web-dev-sdk cho web search."),

  heading3("1.3.1 S\u01a1 \u0111\u1ed3 lu\u1ed3ng d\u1eef li\u1ec7u"),
  bodyText("Lu\u1ed3ng d\u1eef li\u1ec7u ch\u00ednh c\u1ee7a h\u1ec7 th\u1ed1ng bao g\u1ed3m: (1) Chat Flow \u2014 Ng\u01b0\u1eddi d\u00f9ng nh\u1eadp tin nh\u1eafn \u2192 useChat hook \u2192 POST /api/chat \u2192 streamText (Qwen/Hermes) \u2192 Streaming response; (2) Search Flow \u2014 Nh\u1eadp truy v\u1ea5n \u2192 POST /api/search \u2192 web_search + Nominatim + web_reader \u2192 Qwen t\u1ed5ng h\u1ee3p \u2192 K\u1ebft qu\u1ea3 c\u00f3 tr\u00edch d\u1eabn ngu\u1ed3n; (3) Map Flow \u2014 T\u00ecm \u0111\u1ecba \u0111i\u1ec3m \u2192 GET /api/search/places \u2192 Nominatim + Overpass \u2192 Leaflet hi\u1ec3n th\u1ecb markers."),

  heading3("1.3.2 Hai m\u00f4 h\u00ecnh k\u1ebft n\u1ed1i"),
  bodyText("H\u1ec7 th\u1ed1ng h\u1ed7 tr\u1ee3 hai m\u00f4 h\u00ecnh k\u1ebft n\u1ed1i ch\u00ednh v\u1edbi Hermes Agent: M\u00f4 h\u00ecnh 1 (Model Provider) \u2014 Hermes \u0111\u00f3ng vai tr\u00f2 l\u00e0 endpoint LLM, Vercel AI SDK g\u1ecdi nh\u01b0 OpenAI API th\u00f4ng qua createOpenAI() v\u1edbi baseURL tr\u1ecf \u0111\u1ebfn Hermes Gateway. \u0110i\u1ec3m m\u1ea1nh l\u00e0 \u1ee9ng d\u1ee5ng web c\u00f3 ngay tr\u00ed nh\u1edb d\u00e0i h\u1ea1n t\u1eeb Hermes v\u00e0 streaming UI m\u01b0\u1ee3t m\u00e0 v\u1edbi useChat hook."),
  bodyText("M\u00f4 h\u00ecnh 2 (Tool Executor via MCP) \u2014 Hermes th\u1ef1c thi c\u00f4ng c\u1ee5 qua MCP (Model Context Protocol) protocol. Web UI g\u1ecdi skill/tool c\u1ee7a Hermes qua MCP server, cho ph\u00e9p ch\u1ea1y shell, duy\u1ec7t web, g\u1eedi email tr\u1ef1c ti\u1ebfp t\u1eeb dashboard. MCP protocol linh ho\u1ea1t v\u00e0 d\u1ec5 m\u1edf r\u1ed9ng v\u1edbi server m\u1edbi."),
);

// === CHƯƠNG 2: CÀI ĐẶT ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 2: C\u00e0i \u0111\u1eb7t v\u00e0 tri\u1ec3n khai"),

  heading2("2.1 Y\u00eau c\u1ea7u h\u1ec7 th\u1ed1ng"),
  makeTable(
    ["Y\u00eau c\u1ea7u", "Chi ti\u1ebft"],
    [
      ["Node.js", "\u2265 18.0 (khuy\u1ebfn ngh\u1ecb 20+)"],
      ["Bun", "\u2265 1.0 (thay th\u1ebf Node.js runtime)"],
      ["H\u1ec7 \u0111i\u1ec1u h\u00e0nh", "Linux / macOS / Windows (WSL2)"],
      ["RAM", "\u2265 2 GB (4 GB khuy\u1ebfn ngh\u1ecb)"],
      ["Disk", "\u2265 500 MB (bao g\u1ed3m dependencies)"],
      ["Python", "\u2265 3.11 (ch\u1ec9 c\u1ea7n n\u1ebfu ch\u1ea1y Hermes Agent)"],
      ["Git", "M\u1edbi nh\u1ea5t (\u0111\u1ec3 clone repository)"],
    ],
    [30, 70],
  ),

  heading2("2.2 C\u00e0i \u0111\u1eb7t t\u1eeb source code"),
  numberedItem("Clone repository t\u1eeb GitHub:", "num-setup"),
  codeBlock("git clone https://github.com/xegheplimo-web/pyai.git"),
  codeBlock("cd pyai"),
  numberedItem("C\u00e0i \u0111\u1eb7t dependencies:", "num-setup"),
  codeBlock("bun install"),
  bodyText("L\u1ec7nh tr\u00ean s\u1ebd c\u00e0i \u0111\u1eb7t t\u1ea5t c\u1ea3 c\u00e1c th\u01b0 vi\u1ec7n c\u1ea7n thi\u1ebft bao g\u1ed3m Next.js, Vercel AI SDK, shadcn/ui components, Leaflet, Framer Motion, Prisma, v\u00e0 z-ai-web-dev-sdk. Qu\u00e1 tr\u00ecnh c\u00e0i \u0111\u1eb7t m\u1ea5t kho\u1ea3ng 1-3 ph\u00fat t\u00f9y t\u1ed1c \u0111\u1ed9 m\u1ea1ng."),
  numberedItem("C\u1ea5u h\u00ecnh bi\u1ebfn m\u00f4i tr\u01b0\u1eddng:", "num-setup"),
  bodyText("T\u1ea1o file .env t\u1ea1i th\u01b0 m\u1ee5c g\u1ed1c v\u1edbi n\u1ed9i dung sau:"),
  codeBlock("DATABASE_URL=file:./db/custom.db"),
  codeBlock("HERMES_API_URL=http://127.0.0.1:8642/v1"),
  codeBlock("HERMES_API_KEY=hermes-local"),
  codeBlock("QWEN_API_KEY=<API_KEY_CUA_BAN>"),
  codeBlock("QWEN_BASE_URL=https://ws-xxxxx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"),
  codeBlock("QWEN_MODEL=qwen3.5-flash"),
  numberedItem("Kh\u1edfi t\u1ea1o c\u01a1 s\u1edf d\u1eef li\u1ec7u:", "num-setup"),
  codeBlock("bun run db:push"),
  codeBlock("bun run db:generate"),
  numberedItem("Kh\u1edfi ch\u1ea1y m\u00e1y ch\u1ee7 ph\u00e1t tri\u1ec3n:", "num-setup"),
  codeBlock("bun run dev"),
  bodyText("M\u00e1y ch\u1ee7 s\u1ebd kh\u1edfi ch\u1ea1y t\u1ea1i http://localhost:3000. M\u1ecdi thay \u0111\u1ed5i v\u1ec1 code s\u1ebd \u0111\u01b0\u1ee3c t\u1ef1 \u0111\u1ed9ng reload nh\u1edd Hot Module Replacement (HMR) c\u1ee7a Next.js."),
  numberedItem("Build v\u00e0 ch\u1ea1y production:", "num-setup"),
  codeBlock("bun run build"),
  codeBlock("bun run start"),

  heading2("2.3 C\u1ea5u h\u00ecnh bi\u1ebfn m\u00f4i tr\u01b0\u1eddng"),
  makeTable(
    ["Bi\u1ebfn", "B\u1eaft bu\u1ed9c", "M\u1eb7c \u0111\u1ecbnh", "M\u00f4 t\u1ea3"],
    [
      ["DATABASE_URL", "C\u00f3", "file:./db/custom.db", "\u0110\u01b0\u1eddng d\u1eabn SQLite cho Prisma ORM"],
      ["HERMES_API_URL", "Kh\u00f4ng", "http://127.0.0.1:8642/v1", "Endpoint OpenAI-compatible c\u1ee7a Hermes Agent"],
      ["HERMES_API_KEY", "Kh\u00f4ng", "hermes-local", "API key x\u00e1c th\u1ef1c v\u1edbi Hermes Gateway"],
      ["QWEN_API_KEY", "C\u00f3", "\u2014", "API key t\u1eeb Alibaba Cloud DashScope"],
      ["QWEN_BASE_URL", "C\u00f3", "\u2014", "Endpoint OpenAI-compatible c\u1ee7a Qwen (DashScope)"],
      ["QWEN_MODEL", "Kh\u00f4ng", "qwen3.5-flash", "T\u00ean model Qwen s\u1eed d\u1ee5ng"],
    ],
    [20, 12, 28, 40],
  ),
  bodyText("L\u01b0u \u00fd: HERMES_API_URL v\u00e0 HERMES_API_KEY kh\u00f4ng b\u1eaft bu\u1ed9c v\u00ec h\u1ec7 th\u1ed1ng v\u1eabn ho\u1ea1t \u0111\u1ed9ng b\u00ecnh th\u01b0\u1eddng khi Hermes Agent kh\u00f4ng kh\u1edfi ch\u1ea1y \u2014 c\u00e1c API route s\u1ebd tr\u1ea3 v\u1ec1 d\u1eef li\u1ec7u demo. QWEN_API_KEY l\u00e0 b\u1eaft bu\u1ed9c \u0111\u1ec3 s\u1eed d\u1ee5ng ch\u1ee9c n\u0103ng chat v\u00e0 t\u00ecm ki\u1ebfm th\u00f4ng minh."),
);

// === CHƯƠNG 3: TÍNH NĂNG ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 3: Ch\u1ee9c n\u0103ng ch\u00ednh"),

  heading2("3.1 Chat AI \u0111a model"),
  bodyText("H\u1ec7 th\u1ed1ng h\u1ed7 tr\u1ee3 chat streaming th\u1ef1c t\u1ebf v\u1edbi hai model AI c\u00f3 th\u1ec3 chuy\u1ec3n \u0111\u1ed5i nhanh th\u00f4ng qua Model Picker \u1edf g\u00f3c ph\u1ea3i header. Khi ng\u01b0\u1eddi d\u00f9ng g\u1eedi tin nh\u1eafn, useChat hook t\u1eeb Vercel AI SDK s\u1ebd g\u1eedi request \u0111\u1ebfn POST /api/chat k\u00e8m th\u00f4ng tin model \u0111\u01b0\u1ee3c ch\u1ecdn. API route s\u1ebd chuy\u1ec3n h\u01b0\u1edbng \u0111\u1ebfn nh\u00e0 cung c\u1ea5p t\u01b0\u01a1ng \u1ee9ng (Qwen ho\u1eb7c Hermes) v\u00e0 tr\u1ea3 v\u1ec1 streaming response."),
  makeTable(
    ["Model", "Nh\u00e0 cung c\u1ea5p", "\u1ee8ng d\u1ee5ng", "\u0110\u1eb7c \u0111i\u1ec3m"],
    [
      ["Qwen 3.5 Flash", "Alibaba Cloud (DashScope)", "Chat th\u00f4ng minh, t\u1ed5ng h\u1ee3p t\u00ecm ki\u1ebfm", "Nhanh, \u0111a ng\u00f4n ng\u1eef, chi ph\u00ed th\u1ea5p"],
      ["Hermes Agent", "Nous Research (Local)", "Agent t\u1ef1 tr\u1ecb, tr\u00ed nh\u1edb b\u1ec1n v\u1eefng", "Ch\u1ea1y c\u1ee5c b\u1ed9, MCP tools, skills"],
    ],
    [20, 22, 28, 30],
  ),
  bodyText("Qu\u00e1 tr\u00ecnh ho\u1ea1t \u0111\u1ed9ng c\u1ee7a chat flow: (1) Ng\u01b0\u1eddi d\u00f9ng nh\u1eadp tin nh\u1eafn v\u00e0 nh\u1ea5n Enter ho\u1eb7c n\u00fat G\u1eedi; (2) useChat hook g\u1eedi POST request \u0111\u1ebfn /api/chat v\u1edbi body ch\u1ee9a messages v\u00e0 model ID; (3) API route ch\u1ecdn provider t\u01b0\u01a1ng \u1ee9ng v\u00e0 g\u1ecdi streamText(); (4) Response \u0111\u01b0\u1ee3c stream v\u1ec1 client theo t\u1eebng token, hi\u1ec3n th\u1ecb real-time tr\u00ean giao di\u1ec7n; (5) K\u1ebft qu\u1ea3 \u0111\u01b0\u1ee3c l\u01b0u v\u00e0o c\u01a1 s\u1edf d\u1eef li\u1ec7u SQLite th\u00f4ng qua Prisma ORM."),

  heading2("3.2 T\u00ecm ki\u1ebfm th\u00f4ng minh ki\u1ec3u Perplexity"),
  bodyText("T\u00ednh n\u0103ng t\u00ecm ki\u1ebfm th\u00f4ng minh l\u00e0 \u0111i\u1ec3m nh\u1ea5n c\u1ee7a h\u1ec7 th\u1ed1ng, ho\u1ea1t \u0111\u1ed9ng t\u01b0\u01a1ng t\u1ef1 Perplexity AI v\u1edbi kh\u1ea3 n\u0103ng t\u00ecm ki\u1ebfm nhi\u1ec1u ngu\u1ed3n, \u0111\u1ecdc v\u00e0 ph\u00e2n t\u00edch n\u1ed9i dung, r\u1ed3i t\u1ed5ng h\u1ee3p c\u00e2u tr\u1ea3 l\u1eddi chi ti\u1ebft c\u00f3 tr\u00edch d\u1eabn ngu\u1ed3n. H\u1ec7 th\u1ed1ng h\u1ed7 tr\u1ee3 ba ch\u1ebf \u0111\u1ed9 t\u00ecm ki\u1ebfm kh\u00e1c nhau ph\u00f9 h\u1ee3p v\u1edbi t\u1eebng nhu c\u1ea7u c\u1ee5 th\u1ec3."),
  makeTable(
    ["Ch\u1ebf \u0111\u1ed9", "API Endpoint", "M\u00f4 t\u1ea3", "K\u1ebft qu\u1ea3"],
    [
      ["Th\u00f4ng minh", "POST /api/search", "T\u00ecm ki\u1ebfm web + AI t\u1ed5ng h\u1ee3p", "C\u00e2u tr\u1ea3 l\u1eddi + ngu\u1ed3n + \u0111\u1ecba \u0111i\u1ec3m"],
      ["\u0110\u1ecba \u0111i\u1ec3m", "GET /api/search/places", "Geocoding v\u00e0 POI search", "Danh s\u00e1ch \u0111\u1ecba \u0111i\u1ec3m tr\u00ean b\u1ea3n \u0111\u1ed3"],
      ["Doanh nghi\u1ec7p", "POST /api/search/business", "Web + b\u1ea3n \u0111\u1ed3 + AI ph\u00e2n t\u00edch", "Th\u00f4ng tin DN + \u0111\u1ecba \u0111i\u1ec3m + ngu\u1ed3n"],
    ],
    [15, 25, 30, 30],
  ),

  heading3("3.2.1 Quy tr\u00ecnh t\u00ecm ki\u1ebfm th\u00f4ng minh"),
  numberedItem("Ph\u00e2n t\u00edch \u00fd \u0111\u1ed3 truy v\u1ea5n: H\u1ec7 th\u1ed1ng t\u1ef1 \u0111\u1ed9ng nh\u1eadn di\u1ec7n xem truy v\u1ea5n c\u00f3 li\u00ean quan \u0111\u1ebfn \u0111\u1ecba \u0111i\u1ec3m hay kh\u00f4ng th\u00f4ng qua danh s\u00e1ch t\u1eeb kh\u00f3a (c\u1eeda h\u00e0ng, nh\u00e0 h\u00e0ng, \u1edf \u0111\u00e2u, qu\u1eadn, t\u1ec9nh, v.v.).", "num-search"),
  numberedItem("T\u00ecm ki\u1ebfm web song song: S\u1eed d\u1ee5ng z-ai-web-dev-sdk web_search v\u1edbi fallback DuckDuckGo \u0111\u1ec3 t\u00ecm ki\u1ebfm nhi\u1ec1u ngu\u1ed3n th\u00f4ng tin. K\u1ebft qu\u1ea3 bao g\u1ed3m ti\u00eau \u0111\u1ec1, snippet, URL v\u00e0 host name.", "num-search"),
  numberedItem("T\u00ecm ki\u1ebfm \u0111\u1ecba \u0111i\u1ec3m (n\u1ebfu c\u00f3): G\u1ecdi Nominatim API (OpenStreetMap) v\u00e0 Overpass API \u0111\u1ec3 geocoding v\u00e0 t\u00ecm POI (Point of Interest). Auto-detect th\u00e0nh ph\u1ed1 (HCM, H\u00e0 N\u1ed9i, \u0110\u00e0 N\u1eb5ng) \u0111\u1ec3 thu h\u1eb9p viewbox.", "num-search"),
  numberedItem("\u0110\u1ecdc n\u1ed9i dung trang web: S\u1eed d\u1ee5ng z-ai-web-dev-sdk web_reader \u0111\u1ec3 \u0111\u1ecdc chi ti\u1ebft t\u1ed1i \u0111a 3-4 trang web h\u00e0ng \u0111\u1ea7u, tr\u00edch xu\u1ea5t n\u1ed9i dung c\u00f3 gi\u00e1 tr\u1ecb.", "num-search"),
  numberedItem("AI t\u1ed5ng h\u1ee3p: Qwen 3.5 Flash ph\u00e2n t\u00edch t\u1ea5t c\u1ea3 ngu\u1ed3n th\u00f4ng tin v\u00e0 t\u1ea1o c\u00e2u tr\u1ea3 l\u1eddi chi ti\u1ebft c\u00f3 c\u1ea5u tr\u00fac, tr\u00edch d\u1eabn ngu\u1ed3n b\u1eb1ng s\u1ed1 [1], [2], v.v.", "num-search"),

  heading3("3.2.2 Hi\u1ec3n th\u1ecb k\u1ebft qu\u1ea3"),
  bodyText("K\u1ebft qu\u1ea3 t\u00ecm ki\u1ebfm \u0111\u01b0\u1ee3c hi\u1ec3n th\u1ecb theo b\u1ed1 c\u1ee5c 3 c\u1ed9t: (1) Thanh ngu\u1ed3n tham kh\u1ea3o \u2014 hi\u1ec3n th\u1ecb c\u00e1c ngu\u1ed3n web d\u01b0\u1edbi d\u1ea1ng card c\u00f3 th\u1ec3 click m\u1edf tab m\u1edbi; (2) Panel c\u00e2u tr\u1ea3 l\u1eddi AI \u2014 hi\u1ec3n th\u1ecb c\u00e2u tr\u1ea3 l\u1eddi t\u1ed5ng h\u1ee3p v\u1edbi tr\u00edch d\u1eabn ngu\u1ed3n; (3) Panel b\u1ea3n \u0111\u1ed3 \u2014 hi\u1ec3n th\u1ecb c\u00e1c \u0111\u1ecba \u0111i\u1ec3m tr\u00ean Leaflet map v\u1edbi markers t\u01b0\u01a1ng t\u00e1c, k\u00e8m danh s\u00e1ch \u0111\u1ecba \u0111i\u1ec3m chi ti\u1ebft v\u1edbi s\u1ed1 \u0111i\u1ec7n tho\u1ea1i, website, gi\u1edd m\u1edf c\u1eeda."),

  heading2("3.3 B\u1ea3n \u0111\u1ed3 t\u01b0\u01a1ng t\u00e1c"),
  bodyText("H\u1ec7 th\u1ed1ng s\u1eed d\u1ee5ng Leaflet v\u1edbi tile layer t\u1eeb OpenStreetMap \u0111\u1ec3 hi\u1ec3n th\u1ecb b\u1ea3n \u0111\u1ed3 ho\u00e0n to\u00e0n mi\u1ec5n ph\u00ed, kh\u00f4ng c\u1ea7n API key. \u0110i\u1ec3m m\u1ea1nh l\u00e0 t\u00edch h\u1ee3p s\u00e2u v\u00e0o quy tr\u00ecnh t\u00ecm ki\u1ebfm \u2014 khi ng\u01b0\u1eddi d\u00f9ng t\u00ecm c\u1eeda h\u00e0ng ho\u1eb7c doanh nghi\u1ec7p, k\u1ebft qu\u1ea3 \u0111\u01b0\u1ee3c t\u1ef1 \u0111\u1ed9ng hi\u1ec3n th\u1ecb tr\u00ean b\u1ea3n \u0111\u1ed3 v\u1edbi markers c\u00f3 popup ch\u1ee9a th\u00f4ng tin chi ti\u1ebft."),
  bodyText("Component MapComponent \u0111\u01b0\u1ee3c dynamic import (SSR disabled) \u0111\u1ec3 tr\u00e1nh l\u1ed7i hydration v\u1edbi Leaflet. M\u1eb7c \u0111\u1ecbnh b\u1ea3n \u0111\u1ed3 center t\u1ea1i TP.HCM (10.8231, 106.6297). Khi c\u00f3 k\u1ebft qu\u1ea3, b\u1ea3n \u0111\u1ed3 t\u1ef1 \u0111\u1ed9ng fit bounds \u0111\u1ec3 hi\u1ec3n t\u1ea5t c\u1ea3 markers. \u0110\u1ecba \u0111i\u1ec3m \u0111\u01b0\u1ee3c ch\u1ecdn s\u1ebd highlight b\u1eb1ng marker cam v\u1edbi bi\u1ec3u t\u01b0\u1ee3ng ng\u00f4i sao, v\u00e0 b\u1ea3n \u0111\u1ed3 zoom v\u00e0o v\u1ecb tr\u00ed \u0111\u00f3."),

  heading2("3.4 Qu\u1ea3n l\u00fd phi\u00ean l\u00e0m vi\u1ec7c"),
  bodyText("H\u1ec7 th\u1ed1ng cung c\u1ea5p tab Sessions \u0111\u1ec3 xem c\u00e1c phi\u00ean l\u00e0m vi\u1ec7c v\u1edbi Hermes Agent. M\u1ed7i phi\u00ean bao g\u1ed3m th\u00f4ng tin ti\u00eau \u0111\u1ec1, s\u1ed1 tin nh\u1eafn, tr\u1ea1ng th\u00e1i (active/completed), v\u00e0 th\u1eddi gian c\u1eadp nh\u1eadt. Ng\u01b0\u1eddi d\u00f9ng c\u00f3 th\u1ec3 ti\u1ebfp t\u1ee5c ho\u1eb7c fork m\u1ed9t phi\u00ean c\u0169. Khi Hermes Agent offline, h\u1ec7 th\u1ed1ng v\u1eabn hi\u1ec3n th\u1ecb 3 phi\u00ean demo \u0111\u1ec3 tham kh\u1ea3o giao di\u1ec7n."),

  heading2("3.5 Xem Skills v\u00e0 Toolsets"),
  bodyText("Tab Skills hi\u1ec3n th\u1ecb danh s\u00e1ch c\u00e1c k\u1ef9 n\u0103ng v\u00e0 c\u00f4ng c\u1ee5 c\u1ee7a Hermes Agent, \u0111\u01b0\u1ee3c nh\u00f3m theo category (filesystem, execution, web, browser, media, agent). M\u1ed7i skill hi\u1ec3n th\u1ecb t\u00ean, m\u00f4 t\u1ea3 v\u00e0 category icon t\u01b0\u01a1ng \u1ee9ng. Tab c\u0169ng hi\u1ec3n th\u1ecb 4 toolsets (hermes-cli, web-tools, media-tools, mcp-servers) v\u1edbi s\u1ed1 l\u01b0\u1ee3ng tools t\u1eebng toolset. Khi Hermes offline, 14 demo skills \u0111\u01b0\u1ee3c hi\u1ec3n th\u1ecb thay th\u1ebf."),
);

// === CHƯƠNG 4: API ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 4: T\u00e0i li\u1ec7u API"),

  heading2("4.1 Chat API"),
  heading3("POST /api/chat"),
  bodyText("Endpoint streaming chat s\u1eed d\u1ee5ng Vercel AI SDK streamText(). H\u1ed7 tr\u1ee3 hai model provider: Qwen 3.5 Flash (m\u1eb7c \u0111\u1ecbnh) v\u00e0 Hermes Agent. Response \u0111\u01b0\u1ee3c stream theo t\u1eebng token v\u1ec1 client th\u00f4ng qua DataStreamResponse protocol c\u1ee7a Vercel AI SDK."),
  makeTable(
    ["Tham s\u1ed1", "Lo\u1ea1i", "B\u1eaft bu\u1ed9c", "M\u00f4 t\u1ea3"],
    [
      ["messages", "Message[]", "C\u00f3", "M\u1ea3ng tin nh\u1eafn (role + content)"],
      ["model", "string", "Kh\u00f4ng", "ID model: 'qwen3.5-flash' ho\u1eb7c 'hermes-agent'"],
      ["sessionId", "string", "Kh\u00f4ng", "Hermes session ID (ch\u1ec9 d\u00f9ng v\u1edbi hermes-agent)"],
    ],
    [20, 18, 12, 50],
  ),
  bodyText("Response: DataStreamResponse (streaming). L\u1ed7i 503 n\u1ebfu model provider kh\u00f4ng kh\u1ea3 d\u1ee5ng. L\u1ed7i 500 n\u1ebfu l\u1ed7i n\u1ed9i b\u1ed9 server."),

  heading2("4.2 Search APIs"),
  heading3("POST /api/search"),
  bodyText("T\u00ecm ki\u1ebfm th\u00f4ng minh ki\u1ec3u Perplexity. T\u1ef1 \u0111\u1ed9ng ph\u00e1t hi\u1ec7n \u00fd \u0111\u1ed3 \u0111\u1ecba \u0111i\u1ec3m, th\u1ef1c hi\u1ec7n t\u00ecm ki\u1ebfm web + \u0111\u1ecba \u0111i\u1ec3m song song, \u0111\u1ecdc trang web chi ti\u1ebft, v\u00e0 AI t\u1ed5ng h\u1ee3p c\u00e2u tr\u1ea3 l\u1eddi c\u00f3 tr\u00edch d\u1eabn ngu\u1ed3n."),
  makeTable(
    ["Tham s\u1ed1", "Lo\u1ea1i", "B\u1eaft bu\u1ed9c", "M\u00f4 t\u1ea3"],
    [
      ["query", "string", "C\u00f3", "Truy v\u1ea5n t\u00ecm ki\u1ebfm"],
      ["location", "string", "Kh\u00f4ng", "V\u1ecb tr\u00ed h\u1ea1n ch\u1ebf (v\u00ed d\u1ee5: 'Qu\u1eadn 1 TP.HCM')"],
    ],
    [20, 18, 12, 50],
  ),
  bodyText("Response JSON: { answer: string, sources: SearchSource[], places: SearchPlace[], query: string }. M\u1ed7i source c\u00f3 id, url, name, snippet, host_name. M\u1ed7i place c\u00f3 id, name, fullAddress, lat, lon, type, category, phone, website, openingHours."),

  heading3("GET /api/search/places"),
  bodyText("T\u00ecm \u0111\u1ecba \u0111i\u1ec3m s\u1eed d\u1ee5ng Nominatim (OpenStreetMap geocoding) v\u1edbi Overpass API fallback. T\u1ef1 \u0111\u1ed9ng nh\u1eadn di\u1ec7n t\u1eeb kh\u00f3a th\u00e0nh ph\u1ed1 \u0111\u1ec3 thi\u1ebft l\u1eadp viewbox (HCM, H\u00e0 N\u1ed9i, \u0110\u00e0 N\u1eb5ng)."),
  makeTable(
    ["Tham s\u1ed1", "Lo\u1ea1i", "B\u1eaft bu\u1ed9c", "M\u00f4 t\u1ea3"],
    [
      ["q", "string", "C\u00f3", "Truy v\u1ea5n t\u00ecm \u0111\u1ecba \u0111i\u1ec3m"],
      ["limit", "number", "Kh\u00f4ng", "S\u1ed1 k\u1ebft qu\u1ea3 t\u1ed1i \u0111a (m\u1eb7c \u0111\u1ecbnh 10, t\u1ed1i \u0111a 20)"],
      ["viewbox", "string", "Kh\u00f4ng", "Bounding box 'lon1,lat1,lon2,lat2'"],
      ["bounded", "string", "Kh\u00f4ng", "'1' = gi\u1edbi h\u1ea1n trong viewbox"],
    ],
    [20, 18, 12, 50],
  ),

  heading3("POST /api/search/business"),
  bodyText("T\u00ecm ki\u1ebfm doanh nghi\u1ec7p chuy\u00ean s\u00e2u k\u1ebft h\u1ee3p web search + Nominatim + Overpass POI + AI synthesis. S\u1eed d\u1ee5ng Overpass QL query \u0111\u1ec3 t\u00ecm shop, restaurant, bank, pharmacy, hospital, clinic, office theo t\u00ean. T\u1ef1 \u0111\u1ed9ng deduplicate theo proximity (0.001 \u0111\u1ed9)."),
  makeTable(
    ["Tham s\u1ed1", "Lo\u1ea1i", "B\u1eaft bu\u1ed9c", "M\u00f4 t\u1ea3"],
    [
      ["query", "string", "C\u00f3", "T\u00ean lo\u1ea1i h\u00ecnh doanh nghi\u1ec7p"],
      ["location", "string", "Kh\u00f4ng", "V\u1ecb tr\u00ed h\u1ea1n ch\u1ebf"],
    ],
    [20, 18, 12, 50],
  ),

  heading2("4.3 Hermes Proxy APIs"),
  bodyText("C\u00e1c endpoint proxy chuy\u1ec3n h\u01b0\u1edbng request \u0111\u1ebfn Hermes Agent Gateway (m\u1eb7c \u0111\u1ecbnh t\u1ea1i http://127.0.0.1:8642). Khi Hermes offline, t\u1ea5t c\u1ea3 c\u00e1c endpoint tr\u1ea3 v\u1ec1 d\u1eef li\u1ec7u demo \u0111\u1ec3 giao di\u1ec7n v\u1eabn ho\u1ea1t \u0111\u1ed9ng b\u00ecnh th\u01b0\u1eddng."),
  makeTable(
    ["Endpoint", "Method", "Hermes Target", "Fallback"],
    [
      ["/api/hermes/status", "GET", "/health/detailed + /v1/models + /v1/capabilities + /v1/skills + /api/sessions", "connected: false + null data"],
      ["/api/hermes/skills", "GET", "/v1/skills", "14 demo skills"],
      ["/api/hermes/sessions", "GET", "/api/sessions", "3 demo sessions"],
      ["/api/hermes/toolsets", "GET", "/v1/toolsets", "4 demo toolsets"],
    ],
    [25, 10, 35, 30],
  ),
);

// === CHƯƠNG 5: CƠ SỞ DỮ LIỆU ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 5: C\u01a1 s\u1edf d\u1eef li\u1ec7u"),

  heading2("5.1 Schema"),
  bodyText("H\u1ec7 th\u1ed1ng s\u1eed d\u1ee5ng SQLite qua Prisma ORM v\u1edbi hai model ch\u00ednh: Conversation v\u00e0 Message. C\u01a1 s\u1edf d\u1eef li\u1ec7u \u0111\u01b0\u1ee3c l\u01b0u t\u1ea1i file ./db/custom.db, ph\u00f9 h\u1ee3p cho tri\u1ec3n khai c\u1ee5c b\u1ed9 v\u00e0 kh\u00f4ng c\u1ea7n c\u00e0i \u0111\u1eb7t database server ri\u00eang."),

  heading3("5.1.1 Model Conversation"),
  makeTable(
    ["Tr\u01b0\u1eddng", "Lo\u1ea1i", "Thu\u1ed9c t\u00ednh", "M\u00f4 t\u1ea3"],
    [
      ["id", "String", "@id @default(cuid())", "M\u00e3 \u0111\u1ecbnh danh duy nh\u1ea5t"],
      ["title", "String", "@default('Cu\u1ed9c tr\u00f2 chuy\u1ec7n m\u1edbi')", "Ti\u00eau \u0111\u1ec1 cu\u1ed9c tr\u00f2 chuy\u1ec7n"],
      ["sessionId", "String?", "Optional", "Hermes session ID"],
      ["createdAt", "DateTime", "@default(now())", "Th\u1eddi gian t\u1ea1o"],
      ["updatedAt", "DateTime", "@updatedAt", "Th\u1eddi gian c\u1eadp nh\u1eadt"],
      ["messages", "Message[]", "Relation", "Danh s\u00e1ch tin nh\u1eafn"],
    ],
    [20, 15, 25, 40],
  ),

  heading3("5.1.2 Model Message"),
  makeTable(
    ["Tr\u01b0\u1eddng", "Lo\u1ea1i", "Thu\u1ed9c t\u00ednh", "M\u00f4 t\u1ea3"],
    [
      ["id", "String", "@id @default(cuid())", "M\u00e3 \u0111\u1ecbnh danh duy nh\u1ea5t"],
      ["conversationId", "String", "FK", "Kh\u00f3a ngo\u1ea1i \u2192 Conversation"],
      ["role", "String", "\u2014", "'user' | 'assistant' | 'system'"],
      ["content", "String", "\u2014", "N\u1ed9i dung tin nh\u1eafn"],
      ["hermesSessionKey", "String?", "Optional", "Hermes session key"],
      ["createdAt", "DateTime", "@default(now())", "Th\u1eddi gian t\u1ea1o"],
    ],
    [22, 15, 18, 45],
  ),
  bodyText("Quan h\u1ec7: M\u1ed9t Conversation c\u00f3 nhi\u1ec1u Message (one-to-many), v\u1edbi cascade delete khi x\u00f3a Conversation. Index \u0111\u01b0\u1ee3c t\u1ea1o tr\u00ean conversationId \u0111\u1ec3 t\u1ed1i \u01b0u truy v\u1ea5n tin nh\u1eafn theo phi\u00ean."),

  heading2("5.2 L\u1ec7nh qu\u1ea3n l\u00fd database"),
  makeTable(
    ["L\u1ec7nh", "M\u00f4 t\u1ea3"],
    [
      ["bun run db:push", "\u0110\u1ed3ng b\u1ed9 schema v\u1edbi database (kh\u00f4ng c\u1ea7n migration)"],
      ["bun run db:generate", "T\u1ea1o Prisma Client types"],
      ["bun run db:migrate", "T\u1ea1o v\u00e0 ch\u1ea1y migration"],
      ["bun run db:reset", "Reset to\u00e0n b\u1ed9 database"],
    ],
    [35, 65],
  ),
);

// === CHƯƠNG 6: CẤU TRÚC THỰ MỤC ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 6: C\u1ea5u tr\u00fac th\u01b0 m\u1ee5c d\u1ef1 \u00e1n"),

  heading2("6.1 C\u1ea5u tr\u00fac ch\u00ednh"),
  bodyText("D\u1ef1 \u00e1n \u0111\u01b0\u1ee3c t\u1ed5 ch\u1ee9c theo chu\u1ea9n Next.js App Router, v\u1edbi c\u00e1c file \u0111\u01b0\u1ee3c ph\u00e2n lo\u1ea1i r\u00f5 r\u00e0ng theo ch\u1ee9c n\u0103ng. Th\u01b0 m\u1ee5c src/app/ ch\u1ee9a c\u00e1c route v\u00e0 page, src/components/ ch\u1ee9a React components, src/lib/ ch\u1ee9a utility functions, v\u00e0 src/hooks/ ch\u1ee9a custom hooks."),
  makeTable(
    ["\u0110\u01b0\u1eddng d\u1eabn", "M\u00f4 t\u1ea3"],
    [
      ["src/app/page.tsx", "Trang ch\u1ee7 dashboard (\u0111\u01a1n trang, 4 tabs)"],
      ["src/app/layout.tsx", "Root layout, metadata, fonts, providers"],
      ["src/app/globals.css", "Tailwind CSS + shadcn/ui theme"],
      ["src/app/api/chat/route.ts", "Chat streaming API endpoint"],
      ["src/app/api/search/route.ts", "Smart search API"],
      ["src/app/api/search/places/route.ts", "Places/Geocoding API"],
      ["src/app/api/search/business/route.ts", "Business search API"],
      ["src/app/api/hermes/status/route.ts", "Hermes status proxy"],
      ["src/app/api/hermes/skills/route.ts", "Hermes skills proxy"],
      ["src/app/api/hermes/sessions/route.ts", "Hermes sessions proxy"],
      ["src/app/api/hermes/toolsets/route.ts", "Hermes toolsets proxy"],
      ["src/components/MapComponent.tsx", "Leaflet map component"],
      ["src/components/ui/*", "53 shadcn/ui components"],
      ["src/lib/db.ts", "Prisma client singleton"],
      ["src/lib/utils.ts", "cn() utility function"],
      ["src/hooks/use-mobile.ts", "Mobile detection hook"],
      ["src/hooks/use-toast.ts", "Toast notification hook"],
      ["prisma/schema.prisma", "Database schema definition"],
      [".env", "Environment variables"],
    ],
    [45, 55],
  ),

  heading2("6.2 Th\u01b0 m\u1ee5c hermes-agent/"),
  bodyText("Th\u01b0 m\u1ee5c hermes-agent/ ch\u1ee9a m\u00e3 ngu\u1ed3n c\u1ee7a Hermes Agent framework (Python), \u0111\u01b0\u1ee3c clone t\u1eeb https://github.com/NousResearch/hermes-agent.git. \u0110\u00e2y l\u00e0 m\u1ed9t framework agent t\u1ef1 tr\u1ecb l\u1edbn v\u1edbi h\u01a1n 60 module agent, 80+ module CLI, gateway k\u1ebft n\u1ed1i \u0111a n\u1ec1n t\u1ea3ng (Telegram, WhatsApp, Slack, Discord, v.v.), h\u1ec7 th\u1ed1ng skills v\u00e0 cron scheduler. Hermes Agent kh\u00f4ng b\u1eaft bu\u1ed9c ch\u1ea1y \u0111\u1ec3 dashboard ho\u1ea1t \u0111\u1ed9ng \u2014 h\u1ec7 th\u1ed1ng s\u1ebd t\u1ef1 \u0111\u1ed9ng chuy\u1ec3n sang ch\u1ebf \u0111\u1ed9 demo khi Hermes offline."),
);

// === CHƯƠNG 7: HƯỚNG DẪN SỬ DỤNG ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 7: H\u01b0\u1edbng d\u1eabn s\u1eed d\u1ee5ng"),

  heading2("7.1 Kh\u1edfi \u0111\u1ed9ng h\u1ec7 th\u1ed1ng"),
  numberedItem("M\u1edf terminal v\u00e0 di chuy\u1ec3n \u0111\u1ebfn th\u01b0 m\u1ee5c d\u1ef1 \u00e1n: cd /path/to/pyai", "num-chat"),
  numberedItem("Ki\u1ec3m tra file .env \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1ea5u h\u00ecnh \u0111\u00fang, \u0111\u1eb7c bi\u1ec7t QWEN_API_KEY", "num-chat"),
  numberedItem("Ch\u1ea1y l\u1ec7nh kh\u1edfi \u0111\u1ed9ng: bun run dev", "num-chat"),
  numberedItem("M\u1edf tr\u00ecnh duy\u1ec7t t\u1ea1i http://localhost:3000", "num-chat"),
  numberedItem("Ki\u1ec3m tra tr\u1ea1ng th\u00e1i k\u1ebft n\u1ed1i Hermes \u1edf g\u00f3c ph\u1ea3i header (badge xanh = Online, \u0111\u1ecf = Offline)", "num-chat"),

  heading2("7.2 S\u1eed d\u1ee5ng Chat"),
  numberedItem("Ch\u1ecdn model: Nh\u1ea5n v\u00e0o n\u00fat model picker \u1edf header \u2192 Ch\u1ecdn Qwen 3.5 Flash ho\u1eb7c Hermes Agent", "num-env"),
  numberedItem("Nh\u1eadp tin nh\u1eafn v\u00e0o \u00f4 chat d\u01b0\u1edbi c\u00f9ng v\u00e0 nh\u1ea5n Enter ho\u1eb7c n\u00fat G\u1eedi", "num-env"),
  numberedItem("Xem ph\u1ea3n h\u1ed3i streaming hi\u1ec3n th\u1ecb real-time. C\u00f3 th\u1ec3 nh\u1ea5n n\u00fat Reload \u0111\u1ec3 g\u1eedi l\u1ea1i tin nh\u1eafn cu\u1ed1i", "num-env"),
  numberedItem("S\u1eed d\u1ee5ng Quick Actions \u1edf m\u00e0n h\u00ecnh ch\u00e0o \u0111\u1ec3 nhanh ch\u00f3ng b\u1eaft \u0111\u1ea7u cu\u1ed9c tr\u00f2 chuy\u1ec7n", "num-env"),

  heading2("7.3 S\u1eed d\u1ee5ng t\u00ecm ki\u1ebfm th\u00f4ng minh"),
  numberedItem("Chuy\u1ec3n sang tab T\u00ecm ki\u1ebfm (\u00f4 cam) \u1edf thanh tab", "num-arch"),
  numberedItem("Nh\u1eadp truy v\u1ea5n v\u00e0o \u00f4 t\u00ecm ki\u1ebfm, v\u00ed d\u1ee5: 'Nh\u00e0 h\u00e0ng Qu\u1eadn 1 TP.HCM' ho\u1eb7c 'Quy \u0111\u1ecbnh \u0111\u0103ng k\u00fd kinh doanh 2026'", "num-arch"),
  numberedItem("Ch\u1ecdn ch\u1ebf \u0111\u1ed9 t\u00ecm ki\u1ebfm: Th\u00f4ng minh (t\u1ed5ng h\u1ee3p AI), \u0110\u1ecba \u0111i\u1ec3m (ch\u1ec9 b\u1ea3n \u0111\u1ed3), ho\u1eb7c Doanh nghi\u1ec7p (chi ti\u1ebft DN)", "num-arch"),
  numberedItem("Nh\u1ea5n n\u00fat T\u00ecm ki\u1ebfm ho\u1eb7c Enter \u0111\u1ec3 b\u1eaft \u0111\u1ea7u", "num-arch"),
  numberedItem("Xem k\u1ebft qu\u1ea3: Ngu\u1ed3n tham kh\u1ea3o \u2192 C\u00e2u tr\u1ea3 l\u1eddi AI \u2192 B\u1ea3n \u0111\u1ed3 v\u1edbi \u0111\u1ecba \u0111i\u1ec3m", "num-arch"),
  numberedItem("Click v\u00e0o \u0111\u1ecba \u0111i\u1ec3m \u0111\u1ec3 xem chi ti\u1ebft tr\u00ean b\u1ea3n \u0111\u1ed3 v\u00e0 popup th\u00f4ng tin", "num-arch"),
  numberedItem("S\u1eed d\u1ee5ng g\u1ee3i \u00fd t\u00ecm ki\u1ebfm nhanh ho\u1eb7c l\u1ecbch s\u1eed t\u00ecm ki\u1ebfm \u0111\u1ec3 ti\u1ebft ki\u1ec7m th\u1eddi gian", "num-arch"),

  heading2("7.4 Xem Skills v\u00e0 Architecture"),
  bodyText("Tab Skills hi\u1ec3n th\u1ecb danh s\u00e1ch k\u1ef9 n\u0103ng c\u1ee7a Hermes Agent nh\u00f3m theo category. M\u1ed7i category c\u00f3 m\u00e0u s\u1eafc v\u00e0 icon ri\u00eang: filesystem (amber), execution (red), web (cyan), browser (purple), media (pink), agent (emerald). Tab Ki\u1ebfn tr\u00fac hi\u1ec3n th\u1ecb s\u01a1 \u0111\u1ed3 SVG v\u1edbi 8 node v\u00e0 7 k\u1ebft n\u1ed1i, m\u00f4 t\u1ea3 lu\u1ed3ng d\u1eef li\u1ec7u t\u1eeb ng\u01b0\u1eddi d\u00f9ng \u0111\u1ebfn Hermes Agent. C\u0169ng hi\u1ec3n th\u1ecb hai m\u00f4 h\u00ecnh k\u1ebft n\u1ed1i v\u1edbi code v\u00ed d\u1ee5 v\u00e0 l\u1ee3i \u00edch c\u1ee5 th\u1ec3."),
);

// === CHƯƠNG 8: XỬ LÝ SỰ CỐ ===
bodyChildren.push(
  heading1("Ch\u01b0\u01a1ng 8: X\u1eed l\u00fd s\u1ef1 c\u1ed1"),

  heading2("8.1 C\u00e1c l\u1ed7i th\u01b0\u1eddng g\u1eb7p"),
  makeTable(
    ["L\u1ed7i", "Nguy\u00ean nh\u00e2n", "C\u00e1ch kh\u1eafc ph\u1ee5c"],
    [
      ["Chat kh\u00f4ng ph\u1ea3n h\u1ed3i", "QWEN_API_KEY sai ho\u1eb7c h\u1ebft h\u1ea1n", "Ki\u1ec3m tra .env v\u00e0 thay API key m\u1edbi"],
      ["Hermes Offline badge", "Hermes Gateway ch\u01b0a ch\u1ea1y", "Ch\u1ea1y 'hermes gateway' ho\u1eb7c b\u1ecf qua (d\u00f9ng Qwen)"],
      ["B\u1ea3n \u0111\u1ed3 kh\u00f4ng hi\u1ec3n th\u1ecb", "Leaflet CSS ch\u01b0a t\u1ea3i", "Ki\u1ec3m tra k\u1ebft n\u1ed1i m\u1ea1ng, x\u00f3a cache"],
      ["T\u00ecm ki\u1ebfm kh\u00f4ng c\u00f3 k\u1ebft qu\u1ea3", "Nominatim rate limit ho\u1eb7c offline", "\u0110\u1ee3i 1-2 ph\u00fat r\u1ed3i th\u1eed l\u1ea1i"],
      ["L\u1ed7i 503 Model Provider", "API endpoint kh\u00f4ng kh\u1ea3 d\u1ee5ng", "Ki\u1ec3m tra QWEN_BASE_URL trong .env"],
      ["input.trim() undefined", "useChat hook input undefined", "\u0110\u00e3 fix: s\u1eed d\u1ee5ng input?.trim()"],
      ["Port 3000 \u0111\u00e3 s\u1eed d\u1ee5ng", "Process kh\u00e1c \u0111ang ch\u1ea1y", "kill process ho\u1eb7c \u0111\u1ed5i port"],
    ],
    [22, 33, 45],
  ),

  heading2("8.2 Gi\u1edbi h\u1ea1n \u0111\u00e3 bi\u1ebft"),
  bulletItem("Nominatim API gi\u1edbi h\u1ea1n 1 request/gi\u00e2y \u2014 c\u00e1c t\u00ecm ki\u1ebfm li\u00ean t\u1ee5c c\u00f3 th\u1ec3 b\u1ecb rate limit"),
  bulletItem("Overpass API timeout 15-20 gi\u00e2y \u2014 query ph\u1ee9c t\u1ea1p c\u00f3 th\u1ec3 kh\u00f4ng tr\u1ea3 k\u1ebft qu\u1ea3"),
  bulletItem("DuckDuckGo HTML parsing c\u00f3 th\u1ec3 h\u1ecfng khi h\u1ecd thay \u0111\u1ed5i giao di\u1ec7n"),
  bulletItem("Hermes Agent c\u1ea7n Python 3.11+ v\u00e0 c\u1ea5u h\u00ecnh ri\u00eang \u0111\u1ec3 ch\u1ea1y"),
  bulletItem("Web reader c\u00f3 th\u1ec3 kh\u00f4ng \u0111\u1ecdc \u0111\u01b0\u1ee3c trang c\u00f3 JavaScript rendering"),
  bulletItem("SQLite kh\u00f4ng ph\u00f9 h\u1ee3p cho tri\u1ec3n khai \u0111a instance (production n\u00ean d\u00f9ng PostgreSQL)"),

  heading2("8.3 T\u1ed1i \u01b0u hi\u1ec7u su\u1ea5t"),
  bulletItem("S\u1eed d\u1ee5ng streaming response thay v\u00ec \u0111\u1ee3i to\u00e0n b\u1ed9 k\u1ebft qu\u1ea3 \u0111\u1ec3 gi\u1ea3m th\u1eddi gian ch\u1edd"),
  bulletItem("Parallel fetching: web search v\u00e0 places search ch\u1ea1y \u0111\u1ed3ng th\u1eddi v\u1edbi Promise.all()"),
  bulletItem("Hermes API routes c\u00f3 timeout 5 gi\u00e2y \u0111\u1ec3 kh\u00f4ng block request"),
  bulletItem("Leaflet component \u0111\u01b0\u1ee3c dynamic import (SSR disabled) \u0111\u1ec3 gi\u1ea3m bundle size"),
  bulletItem("Prisma client singleton ng\u0103n ch\u1eb7n t\u1ea1o nhi\u1ec1u connection trong dev mode"),
  bulletItem("Overpass API fallback khi Nominatim kh\u00f4ng c\u00f3 k\u1ebft qu\u1ea3 POI \u0111\u1ee7 chi ti\u1ebft"),
);

const bodySection = {
  properties: {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
      pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
    },
  },
  headers: {
    default: new Header({
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Hermes + Vercel AI SDK \u2014 T\u00e0i li\u1ec7u h\u01b0\u1edbng d\u1eabn", size: 18, color: "94A3B8", font: { ascii: "Calibri", eastAsia: "SimHei" } })] })],
    }),
  },
  footers: {
    default: new Footer({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "94A3B8" })] })],
    }),
  },
  children: bodyChildren,
};

// ========================
// BUILD DOCUMENT
// ========================
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 24, color: c(P.body) },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 32, bold: true, color: c(P.primary) },
        paragraph: { spacing: { before: 360, after: 160, line: 312 } },
      },
      heading2: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 28, bold: true, color: c(P.primary) },
        paragraph: { spacing: { before: 240, after: 120, line: 312 } },
      },
      heading3: {
        run: { font: { ascii: "Calibri", eastAsia: "SimHei" }, size: 24, bold: true, color: c(P.primary) },
        paragraph: { spacing: { before: 200, after: 100, line: 312 } },
      },
    },
  },
  numbering: { config: numberingConfig },
  sections: [coverSection, tocSection, bodySection],
});

// Generate
const OUTPUT = "/home/z/my-project/download/Hermes_Vercel_AI_SDK_Huong_Dan.pdf.docx";
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log("Document generated:", OUTPUT);
});
