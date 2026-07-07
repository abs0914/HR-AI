"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { toast } from "@/components/action-form";
import { Upload, Loader2 } from "lucide-react";

export function UploadButton({ purpose, label, accept, extraFields }: {
  purpose: string;
  label: string;
  accept?: string;
  extraFields?: Record<string, string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("purpose", purpose);
    Object.entries(extraFields ?? {}).forEach(([k, v]) => fd.append(k, v));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(
        purpose === "attendance_import"
          ? `Imported ${data.imported} record(s)${data.skipped?.length ? `, skipped ${data.skipped.length} unmatched row(s)` : ""}.`
          : `Uploaded ${file.name}.`
      );
      router.refresh();
    } catch (err: any) {
      toast(err.message ?? "Upload failed", false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" hidden accept={accept} onChange={handle} />
      <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {label}
      </Button>
    </>
  );
}
