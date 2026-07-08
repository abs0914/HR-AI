"use client";

import { useEffect, useState } from "react";
import { Eye, X, Download, Loader2, FileText } from "lucide-react";

type ViewData = {
  title: string;
  documentType: string;
  status: string;
  kind: "text" | "image" | "pdf" | "other";
  ext: string;
  content: string | null;
};

// In-app document viewer. Text documents render as a styled HTML "paper" sheet
// (no PDF plugin); images/PDFs use the inline /preview route.
export function DocPreviewButton({ id, title, label = "View", className }: {
  id: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ViewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setData(null); setError(null);
    fetch(`/api/documents/${id}/view`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, id]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "neu-pressable inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-white"}
      >
        <Eye size={13} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 p-3 backdrop-blur-sm sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="glass-strong rise-in mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/60 px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{title}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                <a href={`/api/documents/${id}/download?fmt=pdf`} className="neu-pressable inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white">
                  <Download size={13} /> PDF
                </a>
                <a href={`/api/documents/${id}/download?fmt=docx`} className="neu-pressable hidden items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white sm:inline-flex">
                  <Download size={13} /> DOCX
                </a>
                <button onClick={() => setOpen(false)} className="neu-pressable rounded-full bg-white/70 p-1.5 text-gray-500 hover:bg-white">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-100/70 p-4 sm:p-8">
              {error && (
                <div className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center text-sm text-red-600 shadow">
                  {error}
                </div>
              )}
              {!error && !data && (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin text-teal-600" /> Loading document…
                </div>
              )}

              {/* text documents → HTML paper sheet */}
              {data?.kind === "text" && (
                <article className="mx-auto max-w-[720px] rounded-lg bg-white px-6 py-10 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.25)] sm:px-14">
                  <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-6 text-gray-800">
                    {data.content}
                  </pre>
                </article>
              )}

              {/* images → inline */}
              {data?.kind === "image" && (
                <img src={`/api/documents/${id}/preview`} alt={title} className="mx-auto max-w-full rounded-lg bg-white shadow" />
              )}

              {/* stored PDFs → embed */}
              {data?.kind === "pdf" && (
                <iframe src={`/api/documents/${id}/preview`} title={title} className="h-full min-h-[70vh] w-full rounded-lg bg-white" />
              )}

              {/* docx/xlsx/csv have no inline HTML viewer */}
              {data?.kind === "other" && (
                <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow">
                  <FileText size={32} className="mx-auto mb-3 text-teal-600" />
                  <p className="text-sm font-medium text-gray-700">This file type has no inline preview.</p>
                  <p className="mt-1 text-xs text-gray-400">Download it to open in the right app.</p>
                  <a href={`/api/documents/${id}/download?fmt=${data.ext || "docx"}`} className="neu-pressable mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-teal-600 to-teal-700 px-4 py-2 text-sm font-semibold text-white">
                    <Download size={14} /> Download
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
