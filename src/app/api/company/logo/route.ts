import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies")
    .select("document_logo_path")
    .eq("id", session.companyId)
    .single();
  if (!company?.document_logo_path) {
    return NextResponse.json({ error: "No company logo configured" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").download(company.document_logo_path);
  if (error || !data) return NextResponse.json({ error: "Logo not found" }, { status: 404 });
  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": data.type || (company.document_logo_path.endsWith(".png") ? "image/png" : "image/jpeg"),
      "Cache-Control": "private, max-age=300",
    },
  });
}
