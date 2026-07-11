import { groqClient, hasGroq, hasOpenAI, hasAnthropic, GROQ_CLASSIFIER_MODEL } from "@/lib/agent/providers";
import { hasFeature, type Plan } from "@/lib/billing";

export type AIRequestCategory =
  | "simple_question"
  | "company_policy_question"
  | "database_lookup"
  | "document_generation"
  | "file_analysis"
  | "payroll_preparation"
  | "disciplinary_document"
  | "legal_sensitive"
  | "workflow_action"
  | "voice_interaction";

export type Lane = "chat" | "task" | "longform" | "upgrade_required";

const CATEGORIES: AIRequestCategory[] = [
  "simple_question", "company_policy_question", "database_lookup",
  "document_generation", "file_analysis", "payroll_preparation",
  "disciplinary_document", "legal_sensitive", "workflow_action", "voice_interaction",
];

// Cheap keyword fallback when Groq is unavailable or the classifier errors.
function classifyByKeywords(message: string, hasFile: boolean): AIRequestCategory {
  const m = message.toLowerCase();
  if (hasFile || /\b(resume|cv|analyze (this|the) (file|document|upload)|review (this|the) (policy|contract|document))\b/.test(m)) return "file_analysis";
  if (/\b(nte|notice to explain|written warning|disciplin|terminat|suspend|dismissal)\b/.test(m)) return "disciplinary_document";
  if (/\b(legal|labor law|dole|lawsuit|complaint|illegal dismissal)\b/.test(m)) return "legal_sensitive";
  if (/\b(payroll|13th month|cutoff summary|payslip|final pay|last pay|back pay|separation pay|quitclaim)\b/.test(m)) return "payroll_preparation";
  if (/\b(generate|create|draft|prepare|write|make)\b.*\b(coe|contract|memo|offer|certificate|checklist|clearance|evaluation|handbook|job description|interview questions|document|letter)\b/.test(m)) return "document_generation";
  if (/\b(add|create|update|approve|reject|archive|change)\b.*\b(employee|leave|salary|status|record)\b/.test(m)) return "workflow_action";
  if (/\b(who|show|list|how many|which employees|late|absent|pending|balance|missing|due for)\b/.test(m)) return "database_lookup";
  if (/\b(policy|policies|handbook says|allowed to|rule on)\b/.test(m)) return "company_policy_question";
  return "simple_question";
}

export async function classifyRequest(message: string, hasFile: boolean): Promise<AIRequestCategory> {
  if (!hasGroq()) return classifyByKeywords(message, hasFile);
  try {
    const completion = await groqClient().chat.completions.create({
      model: GROQ_CLASSIFIER_MODEL,
      response_format: { type: "json_object" },
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content: `Classify an HR assistant request into exactly one category. Respond as JSON: {"category": "<value>"}.
Categories: ${CATEGORIES.join(", ")}.
Guide: questions/greetings/app help -> simple_question; policy questions -> company_policy_question; "who/show/list/how many" data questions -> database_lookup; creating HR documents (COE, contract, memo, offer, job description) -> document_generation; NTE/warnings/termination docs -> disciplinary_document; legal advice -> legal_sensitive; payroll summaries/exports and final pay / last pay / separation pay computations -> payroll_preparation; resume or uploaded-file analysis -> file_analysis; creating/updating/approving records (employees, leave, attendance) -> workflow_action.${hasFile ? " NOTE: the user attached a file." : ""}`,
        },
        { role: "user", content: message.slice(0, 1500) },
      ],
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    return CATEGORIES.includes(parsed.category) ? parsed.category : classifyByKeywords(message, hasFile);
  } catch (e) {
    console.error("groq classification failed, using keywords:", e);
    return classifyByKeywords(message, hasFile);
  }
}

const TASK_TIER: AIRequestCategory[] = ["document_generation", "file_analysis", "payroll_preparation", "workflow_action"];
const LONGFORM_TIER: AIRequestCategory[] = ["disciplinary_document", "legal_sensitive"];

function allowedForPlan(category: AIRequestCategory, plan: Plan): boolean {
  switch (category) {
    case "document_generation":
      return hasFeature(plan, "document_generation");
    case "file_analysis":
      return hasFeature(plan, "resume_analysis");
    case "disciplinary_document":
    case "legal_sensitive":
      return hasFeature(plan, "premium_document_generation");
    case "payroll_preparation":
      return hasFeature(plan, "payroll_summary");
    case "workflow_action":
      return hasFeature(plan, "agentic_workflows");
    default:
      return true;
  }
}

// Category + plan -> execution lane.
// ponytail: fallbacks cascade Claude -> OpenAI -> Groq so a missing API key degrades instead of breaking.
export function routeRequest(category: AIRequestCategory, plan: Plan): {
  lane: Lane;
  provider: "groq" | "openai" | "anthropic";
} {
  const groqOrOpenAI = () => (hasGroq() ? ("groq" as const) : ("openai" as const));
  if (!allowedForPlan(category, plan)) {
    return { lane: "upgrade_required", provider: groqOrOpenAI() };
  }
  if (LONGFORM_TIER.includes(category)) {
    return {
      lane: "longform",
      provider: hasAnthropic() ? "anthropic" : hasOpenAI() ? "openai" : "groq",
    };
  }
  if (TASK_TIER.includes(category)) {
    if (plan === "free") return { lane: "chat", provider: groqOrOpenAI() }; // limited workflow on Groq
    return { lane: "task", provider: hasOpenAI() ? "openai" : "groq" };
  }
  return { lane: "chat", provider: groqOrOpenAI() };
}
