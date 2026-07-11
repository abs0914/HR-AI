import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import type { Role, SessionContext } from "@/lib/auth";
import { TOOLS, runTool, type ToolContext } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const maxDuration = 120;

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: any;
};

type McpAuth = {
  session: SessionContext;
  supabase: SupabaseClient;
  source: "supabase_jwt" | "service_token";
};

const DEFAULT_MCP_TOOLS = [
  "search_employee",
  "get_employee_profile",
  "list_missing_documents",
  "list_regularization_due",
  "summarize_attendance",
  "list_late_employees",
  "get_leave_balance",
  "list_pending_leaves",
  "search_company_policies",
  "list_compliance_reminders",
  "list_pending_approvals",
  "list_applicants",
  "analyze_resume",
  "generate_document",
  "save_document_content",
  "generate_payroll_summary",
  "export_payroll_xlsx",
  "compute_final_pay",
  "list_final_pay",
  "create_compliance_reminder",
  "create_leave_request",
  "approve_leave_request",
  "reject_leave_request",
  "create_employee_draft",
  "update_employee_draft",
];

const ROLES: Role[] = ["owner", "hr_admin", "manager", "accountant", "employee"];

function jsonRpc(id: JsonRpcRequest["id"], result: unknown, init?: ResponseInit) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, init);
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function allowedToolNames() {
  const configured = process.env.HERMES_MCP_TOOLS?.split(",").map((t) => t.trim()).filter(Boolean);
  const requested = configured?.length ? configured : DEFAULT_MCP_TOOLS;
  const existing = new Set(TOOLS.map((t) => t.name));
  return requested.filter((name) => existing.has(name));
}

function mcpTools() {
  const allowed = new Set(allowedToolNames());
  return TOOLS
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    }));
}

function serviceTokenSession(token: string): McpAuth | null {
  if (!process.env.HERMES_MCP_TOKEN || token !== process.env.HERMES_MCP_TOKEN) return null;
  const role = process.env.HERMES_MCP_ROLE ?? "hr_admin";
  if (!ROLES.includes(role as Role)) throw new Error(`Invalid HERMES_MCP_ROLE "${role}".`);
  const userId = process.env.HERMES_MCP_USER_ID;
  const companyId = process.env.HERMES_MCP_COMPANY_ID;
  if (!userId || !companyId) {
    throw new Error("HERMES_MCP_USER_ID and HERMES_MCP_COMPANY_ID are required for service-token MCP auth.");
  }
  return {
    source: "service_token",
    supabase: createAdminClient(),
    session: {
      userId,
      companyId,
      role: role as Role,
      email: process.env.HERMES_MCP_EMAIL ?? "hermes@kawaniai.com",
    },
  };
}

async function supabaseJwtSession(token: string): Promise<McpAuth | null> {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return null;
  const { data: membership, error: membershipError } = await supabase
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return null;
  return {
    source: "supabase_jwt",
    supabase,
    session: {
      userId: user.id,
      email: user.email ?? "",
      companyId: membership.company_id,
      role: membership.role as Role,
    },
  };
}

async function authenticate(req: NextRequest): Promise<McpAuth | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const serviceSession = serviceTokenSession(token);
  if (serviceSession) return serviceSession;
  return supabaseJwtSession(token);
}

async function handleCall(request: JsonRpcRequest, auth: McpAuth) {
  const method = request.method;
  if (!method) return jsonRpcError(request.id, -32600, "Missing JSON-RPC method.");

  if (method === "initialize") {
    return jsonRpc(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      serverInfo: { name: "hr-ai", version: "0.1.0" },
      capabilities: { tools: { listChanged: false } },
    });
  }

  if (method === "tools/list") {
    return jsonRpc(request.id, { tools: mcpTools() });
  }

  if (method === "tools/call") {
    const name = String(request.params?.name ?? "");
    const allowed = new Set(allowedToolNames());
    if (!allowed.has(name)) return jsonRpcError(request.id, -32602, `Tool "${name}" is not exposed to Hermes.`);
    const args = request.params?.arguments ?? {};
    const tc: ToolContext = {
      session: auth.session,
      supabase: auth.supabase,
      conversationId: null,
    };
    const result = await runTool(name, args, tc);
    await logAudit({
      companyId: auth.session.companyId,
      userId: auth.session.userId,
      module: "ai",
      action: "hermes_mcp_tool_call",
      details: {
        source: "hermes_mcp",
        auth: auth.source,
        tool: name,
        ok: result.ok,
        message: result.message,
      },
    });
    return jsonRpc(request.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2).slice(0, 12000),
        },
      ],
      isError: !result.ok,
    });
  }

  return jsonRpcError(request.id, -32601, `Unsupported MCP method "${method}".`);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export async function POST(req: NextRequest) {
  let auth: McpAuth | null = null;
  try {
    auth = await authenticate(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "MCP auth failed" }, { status: 500 });
  }
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON.", 400);
  }

  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((item) => handleCall(item, auth)));
    return NextResponse.json(await Promise.all(responses.map((res) => res.json())));
  }

  if (body.method?.startsWith("notifications/")) {
    return new NextResponse(null, { status: 202 });
  }

  return handleCall(body, auth);
}
