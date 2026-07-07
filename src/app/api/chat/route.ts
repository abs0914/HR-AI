import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { toolSchemas, runTool, type FileCard, type ApprovalCard } from "@/lib/agent/tools";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured. Add it to .env.local." }, { status: 500 });
  }

  const { message, conversationId: convIdIn, fileContext } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const supabase = await createClient();

  // conversation
  let conversationId: string = convIdIn;
  if (!conversationId) {
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ company_id: session.companyId, user_id: session.userId, title: message.slice(0, 80) })
      .select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversationId = data.id;
  }

  // persist user message
  await supabase.from("ai_messages").insert({
    conversation_id: conversationId, company_id: session.companyId,
    user_id: session.userId, role: "user", content: message,
    metadata: fileContext ? { fileContext } : null,
  });

  // history (last 20)
  const { data: history } = await supabase
    .from("ai_messages")
    .select("role, content, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const { data: company } = await supabase
    .from("companies").select("name").eq("id", session.companyId).single();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(session, company?.name ?? "your company") },
    ...(history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content ?? "" })),
  ];
  if (fileContext) {
    messages.push({
      role: "system",
      content: `The user just uploaded a file. Context: ${JSON.stringify(fileContext).slice(0, 6000)}`,
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const tc = { session, supabase, conversationId };

  const files: FileCard[] = [];
  const approvals: ApprovalCard[] = [];
  const toolTrace: { name: string; ok: boolean; message: string }[] = [];

  try {
    for (let turn = 0; turn < 6; turn++) {
      const completion = await openai.chat.completions.create({
        model, messages, tools: toolSchemas(), tool_choice: "auto",
      });
      const choice = completion.choices[0].message;

      if (!choice.tool_calls?.length) {
        const text = choice.content ?? "(no response)";
        await supabase.from("ai_messages").insert({
          conversation_id: conversationId, company_id: session.companyId,
          user_id: session.userId, role: "assistant", content: text,
          metadata: { files, approvals, toolTrace },
        });
        return NextResponse.json({ conversationId, reply: text, files, approvals, toolTrace });
      }

      messages.push(choice);
      for (const call of choice.tool_calls) {
        if (call.type !== "function") continue;
        let args: any = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* keep {} */ }
        const result = await runTool(call.function.name, args, tc);
        if (result.file) files.push(result.file);
        if (result.approval) approvals.push(result.approval);
        toolTrace.push({ name: call.function.name, ok: result.ok, message: result.message });
        messages.push({
          role: "tool", tool_call_id: call.id,
          content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data ?? null }).slice(0, 12000),
        });
      }
    }
    // safety stop after 6 tool turns
    const fallback = "I ran several steps but hit my per-request tool limit. Here is where things stand: " +
      toolTrace.map((t) => `${t.name}: ${t.message}`).join(" | ");
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId, company_id: session.companyId,
      user_id: session.userId, role: "assistant", content: fallback,
      metadata: { files, approvals, toolTrace },
    });
    return NextResponse.json({ conversationId, reply: fallback, files, approvals, toolTrace });
  } catch (e: any) {
    console.error("chat error:", e);
    return NextResponse.json({ error: e.message ?? "AI request failed" }, { status: 500 });
  }
}
