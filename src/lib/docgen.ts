import { AlignmentType, BorderStyle, Document, Header, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, PDFImage, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";

export { fillTemplate, missingVariables } from "@/lib/template";

export type DocumentBranding = {
  companyName: string;
  logo?: Buffer | null;
  logoType?: "png" | "jpg" | null;
};

function logoSize(buffer: Buffer, type: "png" | "jpg"): { width: number; height: number } {
  let width = 0, height = 0;
  if (type === "png" && buffer.length >= 24) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (type === "jpg") {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        height = buffer.readUInt16BE(offset + 5);
        width = buffer.readUInt16BE(offset + 7);
        break;
      }
      offset += Math.max(length + 2, 2);
    }
  }
  if (!width || !height) return { width: 120, height: 48 };
  const maxWidth = 120, maxHeight = 48;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// ---------- DOCX ----------
export async function textToDocx(title: string, body: string, branding?: DocumentBranding): Promise<Buffer> {
  const lines = body.split("\n");
  const headerChildren = branding ? [
    ...(branding.logo && branding.logoType ? [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: branding.logo, type: branding.logoType, transformation: logoSize(branding.logo, branding.logoType) })],
      spacing: { after: 60 },
    })] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: branding.companyName, bold: true, size: 18, font: "Calibri" })],
      border: { bottom: { color: "B8C0CC", size: 6, style: BorderStyle.SINGLE, space: 6 } },
    }),
  ] : [];
  const doc = new Document({
    sections: [{
      headers: headerChildren.length ? { default: new Header({ children: headerChildren }) } : undefined,
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        ...lines.map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line || " ", size: 22, font: "Calibri" })],
              spacing: { after: 120 },
            })
        ),
      ],
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ---------- PDF (simple word-wrapped text) ----------
export async function textToPdf(title: string, body: string, branding?: DocumentBranding): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 10;
  const margin = 56;
  const pageW = 595.28, pageH = 841.89; // A4
  const maxWidth = pageW - margin * 2;

  let embeddedLogo: PDFImage | null = null;
  if (branding?.logo && branding.logoType) {
    embeddedLogo = branding.logoType === "png"
      ? await pdf.embedPng(branding.logo)
      : await pdf.embedJpg(branding.logo);
  }

  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  const drawHeader = () => {
    if (!branding) return;
    const top = pageH - 42;
    if (embeddedLogo) {
      const scale = Math.min(110 / embeddedLogo.width, 38 / embeddedLogo.height, 1);
      page.drawImage(embeddedLogo, { x: margin, y: top - embeddedLogo.height * scale + 8, width: embeddedLogo.width * scale, height: embeddedLogo.height * scale });
    }
    const nameWidth = bold.widthOfTextAtSize(branding.companyName, 9);
    page.drawText(branding.companyName, { x: pageW - margin - nameWidth, y: top - 8, font: bold, size: 9 });
    page.drawLine({ start: { x: margin, y: pageH - 88 }, end: { x: pageW - margin, y: pageH - 88 }, thickness: 0.7, color: rgb(0.72, 0.75, 0.8) });
    y = pageH - 108;
  };
  drawHeader();

  const drawLine = (text: string, f = font, size = fontSize) => {
    if (y < margin) {
      page = pdf.addPage([pageW, pageH]);
      y = pageH - margin;
      drawHeader();
    }
    page.drawText(text, { x: margin, y, font: f, size });
    y -= size * 1.5;
  };

  const wrap = (text: string, f = font, size = fontSize): string[] => {
    if (!text) return [""];
    const words = text.split(" ");
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && cur) {
        out.push(cur);
        cur = w;
      } else cur = candidate;
    }
    out.push(cur);
    return out;
  };

  wrap(title, bold, 14).forEach((l) => drawLine(l, bold, 14));
  y -= 8;
  for (const raw of body.split("\n")) {
    // strip characters helvetica can't encode (e.g. ₱)
    const safe = raw.replace(/[^\x00-\xFF]/g, "");
    wrap(safe).forEach((l) => drawLine(l));
  }
  return Buffer.from(await pdf.save());
}

// ---------- XLSX / CSV ----------
export function rowsToXlsx(rows: Record<string, unknown>[], sheetName = "Report"): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function rowsToCsv(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  return Buffer.from(XLSX.utils.sheet_to_csv(ws), "utf-8");
}

// ---------- storage ----------
const CONTENT_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

export async function saveToStorage(opts: {
  companyId: string;
  employeeId?: string | null;
  documentType: string;
  filename: string;
  buffer: Buffer;
  ext: keyof typeof CONTENT_TYPES;
}): Promise<string> {
  const admin = createAdminClient();
  const safeName = opts.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${opts.companyId}/${opts.employeeId ?? "general"}/${opts.documentType}/${Date.now()}_${safeName}.${opts.ext}`;
  const { error } = await admin.storage
    .from("documents")
    .upload(path, opts.buffer, { contentType: CONTENT_TYPES[opts.ext], upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

export async function signedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Could not sign URL: ${error?.message}`);
  return data.signedUrl;
}
