import type OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  groqClient, openaiClient, anthropicClient, hasOpenAI,
  GROQ_CHAT_MODEL, OPENAI_MODEL, ANTHROPIC_MODEL,
} from "@/lib/agent/providers";
import { toolSchemas, runTool, TOOLS, READ_TOOL_NAMES, type ToolContext, type FileCard, type ApprovalCard } from "@/lib/agent/tools";

export type AgentRun = {
  reply: string;
  files: FileCard[];
  approvals: ApprovalCard[];
  toolTrace: { name: string; ok: boolean; message: string }[];
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

const MAX_TOOL_TURNS = 6;

// ---------- OpenAI-format loop (Groq and OpenAI share the same wire format) ----------

async function runOpenAIStyleLoop(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  tc: ToolContext,
  toolNames?: string[]
): Promise<Omit<AgentRun, "provider" | "model">> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];
  const files: FileCard[] = [];
  const approvals: ApprovalCard[] = [];
  const toolTrace: AgentRun["toolTrace"] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const completion = await client.chat.completions.create({
      model, messages, tools: toolSchemas(toolNames), tool_choice: "auto",
    });
    usage.inputTokens += completion.usage?.prompt_tokens ?? 0;
    usage.outputTokens += completion.usage?.completion_tokens ?? 0;
    const choice = completion.choices[0].message;

    if (!choice.tool_calls?.length) {
      return { reply: choice.content ?? "(no response)", files, approvals, toolTrace, usage };
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
  return {
    reply: "I ran several steps but hit my per-request tool limit. Status: " +
      toolTrace.map((t) => `${t.name}: ${t.message}`).join(" | "),
    files, approvals, toolTrace, usage,
  };
}

// ---------- Anthropic loop (native Messages API tool use) ----------

function anthropicTools(): Anthropic.Tool[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
}

async function runAnthropicLoop(
  systemPrompt: string,
  history: HistoryMessage[],
  tc: ToolContext
): Promise<Omit<AgentRun, "provider" | "model">> {
  const client = anthropicClient();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const files: FileCard[] = [];
  const approvals: ApprovalCard[] = [];
  const toolTrace: AgentRun["toolTrace"] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      system: systemPrompt,
      tools: anthropicTools(),
      messages,
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      return {
        reply: "I can't help with that request. For sensitive employment matters, please consult a qualified HR or legal professional.",
        files, approvals, toolTrace, usage,
      };
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text).join("\n");
      return { reply: text || "(no response)", files, approvals, toolTrace, usage };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const result = await runTool(use.name, use.input, tc);
      if (result.file) files.push(result.file);
      if (result.approval) approvals.push(result.approval);
      toolTrace.push({ name: use.name, ok: result.ok, message: result.message });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify({ ok: result.ok, message: result.message, data: result.data ?? null }).slice(0, 12000),
        is_error: !result.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }
  return {
    reply: "I ran several steps but hit my per-request tool limit. Status: " +
      toolTrace.map((t) => `${t.name}: ${t.message}`).join(" | "),
    files, approvals, toolTrace, usage,
  };
}

// ---------- entry point ----------

export async function runAgent(
  provider: "groq" | "openai" | "anthropic",
  systemPrompt: string,
  history: HistoryMessage[],
  tc: ToolContext
): Promise<AgentRun> {
  if (provider === "anthropic") {
    try {
      const run = await runAnthropicLoop(systemPrompt, history, tc);
      return { ...run, provider, model: ANTHROPIC_MODEL };
    } catch (e: any) {
      // billing/auth/overload on the Anthropic account — degrade to the task engine
      console.error("anthropic failed, falling back:", e.message);
      const fallback = hasOpenAI() ? ("openai" as const) : ("groq" as const);
      const client = fallback === "groq" ? groqClient() : openaiClient();
      const model = fallback === "groq" ? GROQ_CHAT_MODEL : OPENAI_MODEL;
      const run = await runOpenAIStyleLoop(client, model, systemPrompt, history, tc);
      return { ...run, provider: fallback, model };
    }
  }
  const client = provider === "groq" ? groqClient() : openaiClient();
  const model = provider === "groq" ? GROQ_CHAT_MODEL : OPENAI_MODEL;
  // Groq (front desk) gets only the read/query tools — simpler schemas, more reliable calls
  const toolNames = provider === "groq" ? READ_TOOL_NAMES : undefined;
  try {
    const run = await runOpenAIStyleLoop(client, model, systemPrompt, history, tc, toolNames);
    return { ...run, provider, model };
  } catch (e: any) {
    // Groq occasionally emits malformed tool calls ("Failed to call a function") — retry on OpenAI
    if (provider === "groq" && hasOpenAI()) {
      console.error("groq failed, falling back to openai:", e.message);
      const run = await runOpenAIStyleLoop(openaiClient(), OPENAI_MODEL, systemPrompt, history, tc);
      return { ...run, provider: "openai", model: OPENAI_MODEL };
    }
    throw e;
  }
}
