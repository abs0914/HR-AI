import Link from "next/link";
import {
  Bot, FolderOpen, Clock, FileText, CalendarDays, UserSearch, BellRing, ShieldCheck, Check,
} from "lucide-react";

const FEATURES = [
  { icon: Bot, title: "AI HR Agent Console", desc: "Talk to your HR department. Type, speak, or upload files — Kawani AI handles the busywork." },
  { icon: FolderOpen, title: "Employee 201 File Management", desc: "Complete employee records, document checklists, and version-tracked 201 files." },
  { icon: Clock, title: "Attendance & Payroll Preparation", desc: "Import timesheets, detect lates and undertime, and export payroll-ready reports." },
  { icon: FileText, title: "HR Document Generator", desc: "Contracts, COEs, memos, NTEs, and more — generated from Philippine-ready templates as DOCX and PDF." },
  { icon: CalendarDays, title: "Leave Management", desc: "Requests, approvals, balances, and history — with SIL and PH statutory leave types built in." },
  { icon: UserSearch, title: "Recruitment & Resume Analysis", desc: "Upload resumes, get AI scoring and interview questions, and generate job offers." },
  { icon: BellRing, title: "Compliance Reminders", desc: "Regularization dates, 13th month prep, contract expirations, and government contribution reminders." },
  { icon: ShieldCheck, title: "Secure Role-Based Access", desc: "Owner, HR Admin, Manager, Accountant, and Employee roles enforced down to the database row." },
];

const PLANS = [
  { name: "Starter", price: "Free", features: ["1 branch", "Up to 10 employees", "AI chat console", "Document generator"] },
  { name: "Growth", price: "₱1,499/mo", features: ["Up to 50 employees", "Attendance import", "Payroll prep exports", "Leave workflows"] },
  { name: "Business", price: "₱3,499/mo", features: ["Up to 150 employees", "Multi-branch", "Recruitment + resume AI", "Compliance dashboard"] },
  { name: "Pro", price: "₱6,999/mo", features: ["Up to 500 employees", "Voice input", "Priority AI", "Audit log exports"] },
  { name: "Enterprise", price: "Contact us", features: ["Unlimited employees", "Custom templates", "Dedicated support", "SLA"] },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white"><Bot size={18} /></div>
          <span className="text-lg font-bold text-gray-900">HR AI</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-gray-600 hover:text-gray-900">Login</Link>
          <Link href="/signup" className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-dark">Start Free</Link>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <p className="mb-4 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-primary">HR AI — Your AI HR Officer for Philippine SMEs</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Your AI HR Officer for <span className="text-primary">Philippine SMEs</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          Use chat, voice, and file uploads to manage employees, generate HR documents, prepare payroll
          summaries, and organize HR operations in one AI-powered workspace.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="rounded-lg bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-dark">Start Free</Link>
          <a href="mailto:hello@hrai.ph?subject=Book a Demo" className="rounded-lg border border-line px-6 py-3 font-semibold text-gray-700 hover:bg-gray-50">Book Demo</a>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">Everything your HR department does, in one AI workspace</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-muted-bg p-5">
              <f.icon className="mb-3 text-primary" size={22} />
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{f.title}</h3>
              <p className="text-xs leading-relaxed text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold text-gray-900">Simple pricing that grows with your team</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p, i) => (
            <div key={p.name} className={`rounded-xl border p-5 ${i === 2 ? "border-primary shadow-md" : "border-line"}`}>
              <h3 className="text-sm font-bold text-gray-900">{p.name}</h3>
              <p className="mt-1 text-xl font-extrabold text-primary">{p.price}</p>
              <ul className="mt-4 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <Check size={13} className="mt-0.5 shrink-0 text-primary" />{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line bg-muted-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-gray-500">
          <p>© {new Date().getFullYear()} HR AI. Built for Philippine SMEs.</p>
          <nav className="flex gap-5">
            <a href="#" className="hover:text-gray-900">Privacy Policy</a>
            <a href="#" className="hover:text-gray-900">Terms</a>
            <a href="mailto:hello@hrai.ph" className="hover:text-gray-900">Contact</a>
            <Link href="/login" className="hover:text-gray-900">Login</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
