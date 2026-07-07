import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionContext } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Voice input is unavailable. Please type your request." }, { status: 503 });
  }
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "audio file required" }, { status: 400 });
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await openai.audio.transcriptions.create({
      file: new File([await audio.arrayBuffer()], "voice.webm", { type: audio.type || "audio/webm" }),
      model: "whisper-1",
    });
    return NextResponse.json({ text: result.text });
  } catch (e: any) {
    console.error("transcription failed:", e.message);
    return NextResponse.json({ error: "Voice input is unavailable. Please type your request." }, { status: 503 });
  }
}
