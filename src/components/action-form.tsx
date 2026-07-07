"use client";

// Wraps a server action returning {ok, message}: handles pending state + toast.
import { useEffect, useRef, useState, useTransition } from "react";

type Result = { ok: boolean; message: string };

export function toast(message: string, ok = true) {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, ok } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; ok: boolean }[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    const handler = (e: any) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, ...e.detail }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4500);
    };
    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.ok ? "bg-gray-900" : "bg-red-600"}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function ActionForm({
  action, children, className, confirmText, resetOnSuccess = true,
}: {
  action: (fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
  resetOnSuccess?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const result = await action(fd);
            toast(result.message, result.ok);
            if (result.ok && resetOnSuccess) formRef.current?.reset();
          } catch (err: any) {
            // server actions that redirect() throw — let Next handle it
            if (err?.digest?.startsWith?.("NEXT_REDIRECT")) throw err;
            toast(err.message ?? "Something went wrong", false);
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">{children}</fieldset>
    </form>
  );
}
