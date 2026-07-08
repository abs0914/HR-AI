"use client";

import { useEffect, useState } from "react";
import { Eye, X, Download } from "lucide-react";

// Inline document viewer: opens the preview route (inline PDF / image) in a
// glass modal with download shortcuts. Falls back gracefully — the route
// redirects non-viewable types to a download.
export function DocPreviewButton({ id, title, label = "View", className }: {
  id: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

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
            className="glass-strong rise-in mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl shadow-2xl"
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
            <iframe
              src={`/api/documents/${id}/preview`}
              title={title}
              className="h-full w-full flex-1 bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
}
