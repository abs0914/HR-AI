import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { classifyRequest, routeRequest, type Plan } from "@/lib/agent/router";
import { runAgent } from "@/lib/agent/orchestrator";
import { hasGroq, hasOpenAI, hasAnthropic } from "@/lib/agent/providers";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasGroq() && !hasOpenAI() && !hasAnthropic()) {
    return NextResponse.json(
      { error: "No AI provider configured. Set GROQ_API_KEY (and optionally OPENAI_API_KEY / ANTHROPIC_API_KEY) in .env.local." },
      { status: 500 }
    );
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

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId, company_id: session.companyId,
    user_id: session.userId, role: "user", content: message,
    metadata: fileContext ? { fileContext } : null,
  });

  const [{ data: history }, { data: company }] = await Promise.all([
    supabase.from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40),
    supabase.from("companies").select("name, plan").eq("id", session.companyId).single(),
  ]);
  const plan = (company?.plan ?? "premium") as Plan;

  // 1. Groq classifies the request; 2. router picks the lane + engine
  const category = await classifyRequest(message, !!fileContext);
  const route = routeRequest(category, plan);

  // free-plan gate for premium capabilities — no model call needed
  if (route.lane === "upgrade_required") {
    const reply =
      "Document generation and file analysis are available on the Premium plan. " +
      "On your current Free plan I can answer HR questions, look up your data (attendance, leaves, employees), " +
      "and help you navigate the app. Ask your workspace Owner about upgrading to unlock AI document generation, resume analysis, and payroll exports.";
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId, company_id: session.companyId,
      user_id: session.userId, role: "assistant", content: reply,
      metadata: { category, lane: route.lane, plan },
    });
    return NextResponse.json({ conversationId, reply, files: [], approvals: [], toolTrace: [], category });
  }

  const chatHistory = (history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-20)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content ?? "" }));

  let systemPrompt = buildSystemPrompt(session, company?.name ?? "your company");
  if (fileContext) {
    systemPrompt += `\n\nThe user just uploaded a file. Context: ${JSON.stringify(fileContext).slice(0, 6000)}`;
  }
  if (route.lane === "longform") {
    systemPrompt +=
      "\n\nThis request involves a disciplinary or legally sensitive document. Draft carefully: follow Philippine due-process requirements (e.g. the twin-notice rule), keep the tone factual and neutral, clearly label the output as a DRAFT, and explicitly recommend review by a qualified HR or legal professional.";
  }

  try {
    const run = await runAgent(route.provider, systemPrompt, chatHistory, {
      session, supabase, conversationId,
    });

    await supabase.from("ai_messages").insert({
      conversation_id: conversationId, company_id: session.companyId,
      user_id: session.userId, role: "assistant", content: run.reply,
      metadata: {
        category, lane: route.lane, provider: run.provider, model: run.model,
        files: run.files, approvals: run.approvals, toolTrace: run.toolTrace,
      },
    });
    return NextResponse.json({
      conversationId, reply: run.reply,
      files: run.files, approvals: run.approvals, toolTrace: run.toolTrace,
      category, provider: run.provider,
    });
  } catch (e: any) {
    console.error("chat error:", e);
    return NextResponse.json({ error: e.message ?? "AI request failed" }, { status: 500 });
  }
}
