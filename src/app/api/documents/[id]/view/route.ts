import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

// Returns just what the in-app viewer needs: text content is rendered as HTML
// (no PDF), images/PDFs are shown via the /preview route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("employee_documents")
    .select("title, document_type, content, file_url, file_type, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found or not accessible" }, { status: 404 });

  const ext = (doc.file_type || (doc.file_url ? doc.file_url.split(".").pop() : "") || "").toLowerCase();
  const kind = doc.content ? "text" : IMAGE_EXT.has(ext) ? "image" : ext === "pdf" ? "pdf" : "other";

  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "documents", action: "document_previewed", details: { document_id: id, kind },
  });

  return NextResponse.json({
    title: doc.title,
    documentType: doc.document_type,
    status: doc.status,
    createdAt: doc.created_at,
    kind,
    ext,
    content: doc.content ?? null,
  });
}
