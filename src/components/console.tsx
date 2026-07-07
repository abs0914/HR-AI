"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Badge, Card, CardContent } from "@/components/ui";
import { toast } from "@/components/action-form";
import { decideAiAction } from "@/lib/actions";
import {
  Bot, Send, Mic, MicOff, Paperclip, FileText, Download, CheckSquare, User,
  UserPlus, FileSignature, Award, StickyNote, FileSearch, Clock, Calculator,
  CalendarDays, UserCheck, FolderOpen, Loader2,
} from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; files?: FileCard[]; approvals?: ApprovalCard[] };
type FileCard = { documentId: string; title: string; type: string };
type ApprovalCard = { actionId: string; toolName: string; summary: string };

const QUICK_ACTIONS = [
  { icon: UserPlus, label: "Add Employee", prompt: "I want to add a new employee. Ask me for the details you need." },
  { icon: FileSignature, label: "Generate Contract", prompt: "Generate an employment contract. Ask me which employee." },
  { icon: Award, label: "Generate COE", prompt: "Generate a Certificate of Employment. Ask me which employee." },
  { icon: StickyNote, label: "Create Memo", prompt: "Create a company memo. Ask me for the subject and content." },
  { icon: FileSearch, label: "Analyze Resume", prompt: "I want to analyze a resume. I'll upload it — tell me how." },
  { icon: Clock, label: "Check Attendance", prompt: "Summarize attendance for the last 7 days." },
  { icon: Calculator, label: "Payroll Summary", prompt: "Generate a payroll summary for the current cutoff period." },
  { icon: CalendarDays, label: "Pending Leaves", prompt: "Show pending leave requests." },
  { icon: UserCheck, label: "Regularization Due", prompt: "Show employees due for regularization." },
  { icon: FolderOpen, label: "Missing Documents", prompt: "Show employees with missing documents." },
];

export function Console({ role, initialApprovals, initialFiles, recentAudit, canApprove }: {
  role: string;
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

  return (
    <div className="flex gap-6">
      {/* main chat */}
      <div className="flex min-h-[calc(100vh-6rem)] flex-1 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"><Bot size={18} /></div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Ask Kawani AI</h1>
            <p className="text-xs text-gray-500">Your AI HR officer — type, speak, or upload a file. Outputs are drafts until approved.</p>
          </div>
        </div>

        {/* quick actions */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.label}
              onClick={() => send(qa.prompt)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <qa.icon size={13} /> {qa.label}
            </button>
          ))}
        </div>

        {/* messages */}
        <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-line bg-white p-4">
          {messages.length === 0 && (
            <div className="py-16 text-center">
              <Bot size={36} className="mx-auto mb-3 text-primary" />
              <p className="text-sm font-medium text-gray-600">Talk to your HR department.</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-gray-400">
                Try: &ldquo;Generate a COE for Juan Dela Cruz&rdquo; · &ldquo;Who was late more than 3 times this cutoff?&rdquo; · &ldquo;Create a memo about uniform policy&rdquo;
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white"><Bot size={14} /></div>
              )}
              <div className={`max-w-[75%] space-y-2 ${m.role === "user" ? "order-first" : ""}`}>
                <div className={`whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-white" : "bg-muted-bg text-gray-800"}`}>
                  {m.content}
                </div>
                {m.files?.map((f) => (
                  <div key={f.documentId} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-gray-700"><FileText size={14} className="text-primary" /> {f.title}</span>
                    <span className="flex gap-1">
                      <a href={`/api/documents/${f.documentId}/download?fmt=docx`} className="rounded border border-line px-2 py-1 text-xs hover:bg-gray-50">DOCX</a>
                      <a href={`/api/documents/${f.documentId}/download?fmt=pdf`} className="rounded border border-line px-2 py-1 text-xs hover:bg-gray-50">PDF</a>
                    </span>
                  </div>
                ))}
                {m.approvals?.map((a) => (
                  <div key={a.actionId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800"><CheckSquare size={13} /> Pending approval: {a.summary}</p>
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
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600"><User size={14} /></div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={14} className="animate-spin text-primary" /> {toolStatus ?? "Working…"}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* input */}
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <input ref={fileInputRef} type="file" hidden accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg" onChange={handleFile} />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} title="Upload file" disabled={busy}>
            <Paperclip size={16} />
          </Button>
          <Button type="button" variant={recording ? "danger" : "outline"} onClick={toggleRecording} title="Voice input" disabled={busy}>
            {recording ? <MicOff size={16} /> : <Mic size={16} />}
          </Button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={1}
            placeholder={recording ? "Recording… click the mic to stop" : "Ask Kawani AI anything about HR…"}
            className="max-h-32 flex-1 resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Button type="submit" disabled={busy || !input.trim()}><Send size={16} /></Button>
        </form>
        {fileContext && <p className="mt-1 text-xs text-primary">📎 A file is attached to your next message.</p>}
      </div>

      {/* right panel */}
      <aside className="hidden w-72 shrink-0 space-y-4 xl:block">
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"><CheckSquare size={13} /> Pending approvals</p>
            {pendingApprovals.length === 0 && <p className="text-xs text-gray-400">Nothing waiting for approval.</p>}
            <div className="space-y-2">
              {pendingApprovals.slice(0, 5).map((a: any) => (
                <div key={a.id} className="rounded-lg border border-line p-2.5">
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
            <div className="space-y-1.5">
              {files.slice(0, 8).map((f: any) => (
                <a key={f.id} href={`/api/documents/${f.id}/download?fmt=docx`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  <span className="flex min-w-0 items-center gap-1.5"><FileText size={13} className="shrink-0 text-primary" /><span className="truncate">{f.title}</span></span>
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
