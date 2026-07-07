import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Three engines, three jobs:
//   Groq   = HR front desk — classification, Q&A, DB-query summaries (cheap + fast)
//   OpenAI = premium task engine — structured tool execution, doc generation, file analysis
//   Claude = premium long-form engine — disciplinary/legal-sensitive documents, careful writing

export const hasGroq = () => !!process.env.GROQ_API_KEY;
export const hasOpenAI = () => !!process.env.OPENAI_API_KEY;
export const hasAnthropic = () => !!process.env.ANTHROPIC_API_KEY;

// Groq is OpenAI-compatible — same SDK, different base URL.
export function groqClient() {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

export function openaiClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function anthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export const GROQ_CHAT_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
export const GROQ_CLASSIFIER_MODEL = process.env.GROQ_CLASSIFIER_MODEL ?? "llama-3.1-8b-instant";
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
