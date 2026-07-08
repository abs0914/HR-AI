import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { signedUrl, textToPdf } from "@/lib/docgen";

const INLINE_EXT = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // user client — RLS decides visibility
  const supabase = await createClient();
  const { data: doc } = await supabase.from("employee_documents").select("*").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found or not accessible" }, { status: 404 });

  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId: doc.employee_id,
    module: "documents", action: "document_previewed", details: { document_id: id },
  });

  // AI-generated / computed docs carry plain-text content → render inline PDF
  if (doc.content) {
    const buf = await textToPdf(doc.title, doc.content);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.title.replace(/[^a-zA-Z0-9._ -]/g, "")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // uploaded files: PDFs and images render inline in the browser via the signed URL
  if (doc.file_url) {
    const ext = (doc.file_type || doc.file_url.split(".").pop() || "").toLowerCase();
    if (INLINE_EXT.has(ext)) {
      return NextResponse.redirect(await signedUrl(doc.file_url));
    }
    // docx/xlsx/csv have no inline browser viewer — fall back to download
    return NextResponse.redirect(new URL(`/api/documents/${id}/download?fmt=${ext || "docx"}`, req.nextUrl.origin));
  }

  return NextResponse.json({ error: "Nothing to preview for this document" }, { status: 404 });
}
