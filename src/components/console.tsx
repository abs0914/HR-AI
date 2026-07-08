"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Badge, Card, CardContent } from "@/components/ui";
import { toast } from "@/components/action-form";
import { decideAiAction } from "@/lib/actions";
import {
  Bot, Send, Mic, Square, Paperclip, FileText, Download, CheckSquare, User,
  UserPlus, FileSignature, Award, StickyNote, FileSearch, Clock, Calculator,
  CalendarDays, UserCheck, FolderOpen, Loader2, Sparkles,
} from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; files?: FileCard[]; approvals?: ApprovalCard[] };
type FileCard = { documentId: string; title: string; type: string };
type ApprovalCard = { actionId: string; toolName: string; summary: string };

// tint palette so the bento tiles read as one calm system
const QUICK_ACTIONS = [
  { icon: UserPlus, label: "Add Employee", tint: "text-teal-600 bg-teal-100/70", prompt: "I want to add a new employee. Ask me for the details you need." },
  { icon: Award, label: "Generate COE", tint: "text-sky-600 bg-sky-100/70", prompt: "Generate a Certificate of Employment. Ask me which employee." },
  { icon: FileSignature, label: "Contract", tint: "text-indigo-600 bg-indigo-100/70", prompt: "Generate an employment contract. Ask me which employee." },
  { icon: StickyNote, label: "Company Memo", tint: "text-violet-600 bg-violet-100/70", prompt: "Create a company memo. Ask me for the subject and content." },
  { icon: FileSearch, label: "Analyze Resume", tint: "text-fuchsia-600 bg-fuchsia-100/70", prompt: "I want to analyze a resume. I'll upload it — tell me how." },
  { icon: Clock, label: "Attendance", tint: "text-cyan-600 bg-cyan-100/70", prompt: "Summarize attendance for the last 7 days." },
  { icon: Calculator, label: "Payroll", tint: "text-emerald-600 bg-emerald-100/70", prompt: "Generate a payroll summary for the current cutoff period." },
  { icon: CalendarDays, label: "Pending Leaves", tint: "text-amber-600 bg-amber-100/70", prompt: "Show pending leave requests." },
  { icon: UserCheck, label: "Regularization", tint: "text-rose-600 bg-rose-100/70", prompt: "Show employees due for regularization." },
  { icon: FolderOpen, label: "Missing Docs", tint: "text-blue-600 bg-blue-100/70", prompt: "Show employees with missing documents." },
];

const SUGGESTIONS = [
  "Who was late today?",
  "Generate a COE for Juan Dela Cruz",
  "What is our attendance policy?",
  "Show employees due for regularization",
  "Create a memo about the uniform policy",
];

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(new Date()));
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Console({ role, greetingName, initialApprovals, initialFiles, recentAudit, canApprove }: {
  role: string;
  greetingName: string;
  initialApprovals: any[];
  initialFiles: any[];
  recentAudit: any[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(initialApprovals);
  const [files, setFiles] = useState(initialFiles);
  const [fileContext, setFileContext] = useState<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  useEffect(() => {
    const q = params.get("q");
    if (q && !sentInitial.current) { sentInitial.current = true; send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setToolStatus("Kawani AI is thinking…");
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId, fileContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setConversationId(data.conversationId);
      setFileContext(null);
      setMessages((m) => [...m, { role: "assistant", content: data.reply, files: data.files, approvals: data.approvals }]);
      if (data.files?.length) {
        setFiles((f: any[]) => [...data.files.map((x: FileCard) => ({ id: x.documentId, title: x.title, document_type: x.type, status: "draft" })), ...f]);
      }
      if (data.approvals?.length) {
        setPendingApprovals((a: any[]) => [...data.approvals.map((x: ApprovalCard) => ({ id: x.actionId, tool_name: x.toolName, input: { summary: x.summary }, created_at: new Date().toISOString() })), ...a]);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Sorry — something went wrong: ${e.message}` }]);
    } finally {
      setBusy(false);
      setToolStatus(null);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setToolStatus("Transcribing voice…");
        const fd = new FormData();
        fd.append("audio", new Blob(chunks, { type: "audio/webm" }), "voice.webm");
        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setInput((prev) => (prev ? prev + " " : "") + data.text);
        } catch (e: any) {
          toast(e.message ?? "Voice input is unavailable. Please type your request.", false);
        } finally {
          setToolStatus(null);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast("Voice input is unavailable. Please type your request.", false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const isResume = window.confirm(`Upload "${file.name}" as a RESUME for analysis?\n\nOK = resume, Cancel = general HR document.`);
    setToolStatus(`Uploading ${file.name}…`);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("purpose", isResume ? "resume" : "general");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFileContext(data.fileContext);
      setMessages((m) => [...m, { role: "assistant", content: `File "${file.name}" uploaded${isResume ? ` and saved as an applicant resume` : ""}. Tell me what to do with it — e.g. "${isResume ? "Analyze this applicant for a cashier role." : "Summarize this document."}"` }]);
    } catch (err: any) {
      toast(err.message ?? "Upload failed", false);
    } finally {
      setToolStatus(null);
    }
  }

  async function decide(actionId: string, decision: "approve" | "reject") {
    const fd = new FormData();
    fd.append("id", actionId);
    fd.append("decision", decision);
    if (decision === "reject") {
      const reason = window.prompt("Reason for rejection (optional):") ?? "";
      fd.append("reason", reason);
    }
    const result = await decideAiAction(fd);
    toast(result.message, result.ok);
    if (result.ok) {
      setPendingApprovals((a: any[]) => a.filter((x) => x.id !== actionId));
      router.refresh();
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex gap-6">
      <div className="flex min-h-[calc(100dvh-11rem)] flex-1 flex-col md:min-h-[calc(100vh-5rem)]">
        {/* scrollable conversation / hero */}
        <div className="hide-scrollbar flex-1 overflow-y-auto">
          {empty ? (
            <div className="rise-in flex flex-col items-center px-1 pt-2 text-center">
              <span className="orb mb-5 flex h-24 w-24 items-center justify-center">
                <Bot size={38} className="relative z-10 text-white drop-shadow-lg" />
              </span>
              <p className="text-sm font-medium text-teal-700">{greeting()}, {greetingName} 👋</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">How can I support your HR today?</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Your AI HR officer at your fingertips — type, speak, or upload a file. I can look things up, draft documents, and prepare reports. Outputs are drafts until you approve them.
              </p>

              {/* suggestion chips */}
              <div className="hide-scrollbar mt-5 flex w-full gap-2 overflow-x-auto pb-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="neu-pressable glass-strong flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium text-gray-600 disabled:opacity-50"
                  >
                    <Sparkles size={13} className="text-teal-500" /> {s}
                  </button>
                ))}
              </div>

              {/* bento quick actions */}
              <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {QUICK_ACTIONS.map((qa, idx) => (
                  <button
                    key={qa.label}
                    onClick={() => send(qa.prompt)}
                    disabled={busy}
                    className={`neu-pressable lift glass-card flex flex-col items-start gap-2.5 rounded-2xl p-3.5 text-left disabled:opacity-50 ${idx === 0 ? "col-span-2 sm:col-span-1" : ""}`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${qa.tint}`}>
                      <qa.icon size={18} />
                    </span>
                    <span className="text-xs font-semibold text-gray-700">{qa.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              {messages.map((m, i) => (
                <div key={i} className={`msg-in flex gap-2.5 ${m.role === "user" ? "justify-end" : ""}`}>
                  {m.role === "assistant" && (
                    <span className="orb mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                      <Bot size={15} className="relative z-10 text-white" />
                    </span>
                  )}
                  <div className={`max-w-[82%] space-y-2 ${m.role === "user" ? "order-first" : ""}`}>
                    <div className={`whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-lg bg-gradient-to-b from-teal-600 to-teal-700 text-white shadow-[0_8px_20px_-10px_rgba(15,118,110,0.6)]"
                        : "glass-card rounded-bl-lg text-gray-800"
                    }`}>
                      {m.content}
                    </div>
                    {m.files?.map((f) => (
                      <div key={f.documentId} className="glass-card flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5">
                        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-gray-700"><FileText size={15} className="shrink-0 text-teal-600" /> <span className="truncate">{f.title}</span></span>
                        <span className="flex shrink-0 gap-1">
                          <a href={`/api/documents/${f.documentId}/download?fmt=docx`} className="neu-pressable rounded-lg bg-white/70 px-2 py-1 text-xs font-medium hover:bg-white">DOCX</a>
                          <a href={`/api/documents/${f.documentId}/download?fmt=pdf`} className="neu-pressable rounded-lg bg-white/70 px-2 py-1 text-xs font-medium hover:bg-white">PDF</a>
                        </span>
                      </div>
                    ))}
                    {m.approvals?.map((a) => (
                      <div key={a.actionId} className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3.5 py-2.5 backdrop-blur">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800"><CheckSquare size={14} /> Pending approval: {a.summary}</p>
                        {canApprove && (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" onClick={() => decide(a.actionId, "approve")}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => decide(a.actionId, "reject")}>Reject</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {m.role === "user" && (
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full glass-strong text-gray-500"><User size={15} /></span>
                  )}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 pl-1 text-xs font-medium text-gray-500">
                  <Loader2 size={14} className="animate-spin text-teal-600" /> {toolStatus ?? "Working…"}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* composer — floats above the mobile bottom nav */}
        <div className="sticky bottom-24 z-20 mt-3 md:bottom-2">
          <form
            className="glass-strong flex items-end gap-1.5 rounded-[26px] p-2 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.3)]"
            onSubmit={(e) => { e.preventDefault(); send(input); }}
          >
            <input ref={fileInputRef} type="file" hidden accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg" onChange={handleFile} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} title="Upload file"
              className="neu-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/70 disabled:opacity-50">
              <Paperclip size={18} />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              placeholder={recording ? "Listening… tap stop when done" : "Ask Kawani AI anything…"}
              className="max-h-32 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
            <button type="button" onClick={toggleRecording} disabled={busy} title="Voice input"
              className={`neu-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${recording ? "bg-red-500 text-white pulse-ring" : "text-gray-500 hover:bg-white/70"} disabled:opacity-50`}>
              {recording ? <Square size={16} /> : <Mic size={18} />}
            </button>
            <button type="submit" disabled={busy || !input.trim()} title="Send"
              className="neu-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-teal-600 to-teal-700 text-white shadow-[0_8px_18px_-8px_rgba(15,118,110,0.7)] disabled:opacity-40">
              <Send size={17} />
            </button>
          </form>
          {fileContext && <p className="mt-1.5 pl-2 text-xs font-medium text-teal-600">📎 A file is attached to your next message.</p>}
        </div>
      </div>

      {/* right rail — desktop only */}
      <aside className="hidden w-72 shrink-0 space-y-4 xl:block">
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"><CheckSquare size={13} /> Pending approvals</p>
            {pendingApprovals.length === 0 && <p className="text-xs text-gray-400">Nothing waiting for approval.</p>}
            <div className="space-y-2">
              {pendingApprovals.slice(0, 5).map((a: any) => (
                <div key={a.id} className="rounded-2xl bg-white/60 p-3">
                  <p className="text-xs font-medium text-gray-800">{a.input?.summary ?? a.tool_name.replace(/_/g, " ")}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{new Date(a.created_at).toLocaleString("en-PH")}</p>
                  {canApprove && (
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" onClick={() => decide(a.id, "approve")}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => decide(a.id, "reject")}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"><FileText size={13} /> Generated files</p>
            {files.length === 0 && <p className="text-xs text-gray-400">AI-generated documents appear here.</p>}
            <div className="space-y-1">
              {files.slice(0, 8).map((f: any) => (
                <a key={f.id} href={`/api/documents/${f.id}/download?fmt=docx`} className="neu-pressable flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-xs text-gray-700 hover:bg-white/70">
                  <span className="flex min-w-0 items-center gap-1.5"><FileText size={13} className="shrink-0 text-teal-600" /><span className="truncate">{f.title}</span></span>
                  <span className="flex items-center gap-1"><Badge status={f.status}>{f.status}</Badge><Download size={12} className="text-gray-400" /></span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent activity</p>
            <div className="space-y-1.5">
              {recentAudit.map((l: any, i: number) => (
                <p key={i} className="text-[11px] text-gray-500">
                  <span className="font-medium text-gray-700">{l.action.replace(/_/g, " ")}</span> · {l.module} · {new Date(l.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                </p>
              ))}
              {recentAudit.length === 0 && <p className="text-xs text-gray-400">No activity yet.</p>}
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
