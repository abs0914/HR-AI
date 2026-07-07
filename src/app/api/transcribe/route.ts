import { NextRequest, NextResponse } from "next/server";
import { groqClient, openaiClient, hasGroq, hasOpenAI } from "@/lib/agent/providers";
import { getSessionContext } from "@/lib/auth";
import { rateLimit, LIMITS } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`transcribe:${session.userId}`, LIMITS.transcribe.limit, LIMITS.transcribe.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many voice requests — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }
  if (!hasGroq() && !hasOpenAI()) {
    return NextResponse.json({ error: "Voice input is unavailable. Please type your request." }, { status: 503 });
  }
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "audio file required" }, { status: 400 });
  const file = new File([await audio.arrayBuffer()], "voice.webm", { type: audio.type || "audio/webm" });
  try {
    // Groq Whisper is the cheap default; OpenAI Whisper is the fallback.
    const result = hasGroq()
      ? await groqClient().audio.transcriptions.create({ file, model: "whisper-large-v3-turbo" })
      : await openaiClient().audio.transcriptions.create({ file, model: "whisper-1" });
    return NextResponse.json({ text: result.text });
  } catch (e: any) {
    console.error("transcription failed:", e.message);
    // if Groq failed and OpenAI exists, try once more before giving up
    if (hasGroq() && hasOpenAI()) {
      try {
        const result = await openaiClient().audio.transcriptions.create({ file, model: "whisper-1" });
        return NextResponse.json({ text: result.text });
      } catch { /* fall through */ }
    }
    return NextResponse.json({ error: "Voice input is unavailable. Please type your request." }, { status: 503 });
  }
}
