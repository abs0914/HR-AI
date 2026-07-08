"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label } from "@/components/ui";
import { Bot } from "lucide-react";

export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null); setLoading(true);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/console");
        router.refresh();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // if email confirmation is disabled, a session exists — go straight to onboarding
        const { data: { session } } = await supabase.auth.getSession();
        if (session) { router.push("/onboarding"); router.refresh(); }
        else setNotice("Check your email to confirm your account, then log in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (error) throw error;
        setNotice("Password reset email sent. Check your inbox.");
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const titles = { login: "Log in to HR AI", signup: "Create your HR AI account", forgot: "Reset your password" };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="glass-card rise-in w-full max-w-sm rounded-[32px] p-8">
        <Link href="/" className="mb-6 flex flex-col items-center gap-3">
          <span className="orb flex h-16 w-16 items-center justify-center">
            <Bot size={30} className="relative z-10 text-white drop-shadow-lg" />
          </span>
          <span className="text-lg font-bold">HR AI</span>
        </Link>
        <h1 className="mb-6 text-center text-lg font-semibold text-gray-900">{titles[mode]}</h1>
        {error && <p className="mb-4 rounded-xl bg-red-50/80 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="mb-4 rounded-xl bg-emerald-50/80 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.ph" />
          </div>
          {mode !== "forgot" && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </Button>
        </form>
        <div className="mt-5 space-y-1 text-center text-sm text-gray-500">
          {mode === "login" && (
            <>
              <p><Link className="text-primary hover:underline" href="/forgot-password">Forgot password?</Link></p>
              <p>No account? <Link className="text-primary hover:underline" href="/signup">Sign up</Link></p>
            </>
          )}
          {mode !== "login" && <p>Already have an account? <Link className="text-primary hover:underline" href="/login">Log in</Link></p>}
        </div>
      </div>
    </div>
  );
}
