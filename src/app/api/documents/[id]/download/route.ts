import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { signedUrl, textToDocx, textToPdf } from "@/lib/docgen";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const fmt = req.nextUrl.searchParams.get("fmt") ?? "docx";

  // fetched with the user client — RLS decides whether this doc is visible
  const supabase = await createClient();
  const { data: doc } = await supabase.from("employee_documents").select("*").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found or not accessible" }, { status: 404 });

  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId: doc.employee_id,
    module: "documents", action: "document_downloaded", details: { document_id: id, fmt },
  });

  // regenerate from stored content for docx/pdf; otherwise redirect to the stored file
  if (doc.content && (fmt === "pdf" || fmt === "docx")) {
    const { data: company } = await supabase.from("companies")
      .select("name, document_logo_path")
      .eq("id", session.companyId)
      .single();
    let logo: Buffer | null = null;
    if (company?.document_logo_path) {
      const admin = createAdminClient();
      const { data } = await admin.storage.from("documents").download(company.document_logo_path);
      if (data) logo = Buffer.from(await data.arrayBuffer());
    }
    const branding = company ? {
      companyName: company.name,
      logo,
      logoType: company.document_logo_path?.toLowerCase().endsWith(".png") ? "png" as const : "jpg" as const,
    } : undefined;
    const buf = fmt === "pdf"
      ? await textToPdf(doc.title, doc.content, branding)
      : await textToDocx(doc.title, doc.content, branding);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": fmt === "pdf" ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${doc.title.replace(/[^a-zA-Z0-9._ -]/g, "")}.${fmt}"`,
      },
    });
  }
  if (!doc.file_url) return NextResponse.json({ error: "No file stored for this document" }, { status: 404 });
  return NextResponse.redirect(await signedUrl(doc.file_url));
}
