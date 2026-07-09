import Link from "next/link";
import { KawaniLogo, KawaniMark } from "@/components/logo";
import {
  Bot, FolderOpen, Clock, FileText, CalendarDays, UserSearch, BellRing, ShieldCheck,
  Check, Sparkles, Mic, Paperclip, Send, ArrowRight, Wallet,
} from "lucide-react";

const FEATURES = [
  { icon: FolderOpen, title: "Employee 201 Files", desc: "Complete records, document checklists, and version-tracked 201 files.", tint: "text-sky-600 bg-sky-100/70" },
  { icon: Clock, title: "Attendance & Payroll Prep", desc: "Import timesheets, catch lates and undertime, export payroll-ready reports.", tint: "text-cyan-600 bg-cyan-100/70" },
  { icon: FileText, title: "HR Document Generator", desc: "Contracts, COEs, memos, NTEs — Philippine-ready templates as DOCX and PDF.", tint: "text-indigo-600 bg-indigo-100/70" },
  { icon: CalendarDays, title: "Leave Management", desc: "Requests, approvals, and balances with PH statutory leave types built in.", tint: "text-amber-600 bg-amber-100/70" },
  { icon: UserSearch, title: "Recruitment & Resume AI", desc: "Upload resumes, get AI scoring and interview questions, generate offers.", tint: "text-fuchsia-600 bg-fuchsia-100/70" },
  { icon: Wallet, title: "Final Pay & Quitclaims", desc: "Last-pay computation with pro-rated 13th month and leave conversion.", tint: "text-emerald-600 bg-emerald-100/70" },
  { icon: BellRing, title: "Compliance Reminders", desc: "Regularization dates, 13th month prep, and contribution reminders.", tint: "text-rose-600 bg-rose-100/70" },
  { icon: ShieldCheck, title: "Role-Based Security", desc: "Owner, HR, Manager, Accountant, and Employee roles enforced to the database row.", tint: "text-violet-600 bg-violet-100/70" },
];

const PLANS = [
  { name: "Starter", price: "Free", features: ["1 branch", "Up to 10 employees", "AI Q&A + data lookups", "Policy knowledge base"] },
  { name: "Growth", price: "₱1,499", per: "/mo", features: ["Up to 50 employees", "AI document generation", "Attendance import", "Leave workflows"] },
  { name: "Business", price: "₱3,499", per: "/mo", featured: true, features: ["Up to 150 employees", "Multi-branch", "Resume analysis AI", "Compliance dashboard"] },
  { name: "Pro", price: "₱6,999", per: "/mo", features: ["Up to 500 employees", "Voice input", "Priority AI engines", "Audit log exports"] },
  { name: "Enterprise", price: "Let's talk", features: ["Unlimited employees", "Custom templates", "Dedicated support", "SLA"] },
];

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] overflow-x-hidden">
      {/* nav */}
      <header className="glass-strong sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <KawaniLogo size={40} tagline />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="neu-pressable rounded-2xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-white/70">Login</Link>
            <Link href="/signup" className="neu-pressable rounded-2xl bg-gradient-to-b from-teal-600 to-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(15,118,110,0.6)]">
              Start Free
            </Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-2 lg:pt-20">
        <div className="rise-in">
          <p className="glass mb-5 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-teal-700">
            <Sparkles size={13} /> Agentic AI platform for Philippine SMEs
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-[#0e2a47] sm:text-5xl">
            Your AI HR officer,
            <br />
            <span className="bg-gradient-to-r from-teal-600 via-cyan-500 to-indigo-500 bg-clip-text text-transparent">at your fingertips.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-gray-600">
            Chat, speak, or upload a file — Kawani AI manages employees, generates HR documents,
            prepares payroll summaries, and keeps you compliant. You stay in control: every sensitive action needs your approval.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="neu-pressable inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-teal-600 to-teal-700 px-6 py-3.5 text-base font-semibold text-white shadow-[0_12px_28px_-10px_rgba(15,118,110,0.65)]">
              Start Free <ArrowRight size={17} />
            </Link>
            <a href="mailto:hello@kawani.ai?subject=Book a Demo" className="neu-pressable glass-strong inline-flex items-center rounded-2xl px-6 py-3.5 text-base font-semibold text-gray-700">
              Book Demo
            </a>
          </div>
          <p className="mt-4 text-xs text-gray-400">No credit card needed · GCash, Maya & cards for upgrades</p>
        </div>

        {/* live console mockup — mirrors the real app */}
        <div className="rise-in relative" style={{ animationDelay: "0.12s" }}>
          <div className="pointer-events-none absolute -inset-8 rounded-[48px] bg-gradient-to-br from-teal-300/30 via-sky-300/20 to-violet-300/30 blur-2xl" />
          <div className="glass-card relative rounded-[32px] p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="orb flex h-10 w-10 items-center justify-center"><Bot size={18} className="relative z-10 text-white drop-shadow" /></span>
              <div className="leading-tight">
                <p className="text-sm font-bold text-gray-900">Ask Kawani AI</p>
                <p className="text-[11px] text-gray-500">Good morning, Carla 👋</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="ml-auto max-w-[80%] rounded-3xl rounded-br-lg bg-gradient-to-b from-teal-600 to-teal-700 px-4 py-2.5 text-sm text-white shadow-[0_8px_20px_-10px_rgba(15,118,110,0.6)]">
                Generate a COE for Juan Dela Cruz
              </div>
              <div className="flex gap-2">
                <span className="orb mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center"><Bot size={13} className="relative z-10 text-white" /></span>
                <div className="glass-card max-w-[85%] rounded-3xl rounded-bl-lg px-4 py-2.5 text-sm text-gray-800">
                  Done! I generated the Certificate of Employment as a draft — review it below before approving.
                </div>
              </div>
              <div className="glass-card ml-9 flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-gray-700">
                  <FileText size={14} className="shrink-0 text-teal-600" /> COE — Juan Dela Cruz.pdf
                </span>
                <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700">draft</span>
              </div>
            </div>
            <div className="glass-strong mt-4 flex items-center gap-2 rounded-[22px] p-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400"><Paperclip size={15} /></span>
              <span className="flex-1 text-sm text-gray-400">Ask Kawani AI anything…</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400"><Mic size={15} /></span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-teal-600 to-teal-700 text-white"><Send size={14} /></span>
            </div>
          </div>
        </div>
      </section>

      {/* bento features */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-center text-2xl font-bold tracking-tight text-[#0e2a47] sm:text-3xl">
          Everything your HR department does, <span className="text-teal-600">in one AI workspace</span>
        </h2>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* feature hero tile */}
          <div className="lift glass-card relative col-span-2 row-span-2 flex flex-col justify-between overflow-hidden rounded-3xl p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-gradient-to-br from-teal-300/40 to-violet-300/40 blur-2xl" />
            <div className="relative">
              <span className="orb mb-4 flex h-12 w-12 items-center justify-center"><Bot size={22} className="relative z-10 text-white drop-shadow" /></span>
              <h3 className="text-lg font-bold text-gray-900">AI HR Agent Console</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                Talk to your HR department. Kawani AI routes every request to the right engine — quick answers stay fast and affordable,
                documents and payroll get premium reasoning — and logs every action for audit.
              </p>
            </div>
            <div className="relative mt-4 flex flex-wrap gap-1.5">
              {["Who was late today?", "Draft an NTE", "Payroll summary", "What's our leave policy?"].map((q) => (
                <span key={q} className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                  <Sparkles size={11} className="text-teal-500" /> {q}
                </span>
              ))}
            </div>
          </div>

          {FEATURES.map((f) => (
            <div key={f.title} className="lift glass-card flex flex-col gap-2.5 rounded-3xl p-4">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${f.tint}`}><f.icon size={18} /></span>
              <div>
                <h3 className="text-[13px] font-bold leading-snug text-gray-900">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-center text-2xl font-bold tracking-tight text-[#0e2a47] sm:text-3xl">
          Simple pricing that <span className="text-teal-600">grows with your team</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-gray-500">
          Pay with GCash, Maya, or card. Upgrade or lapse back to free anytime — your data stays.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`lift glass-card relative flex flex-col rounded-3xl p-5 ${p.featured ? "ring-2 ring-teal-500/60 shadow-[0_18px_44px_-16px_rgba(15,118,110,0.4)]" : ""}`}
            >
              {p.featured && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-teal-600 to-cyan-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Popular
                </span>
              )}
              <h3 className="text-sm font-bold text-gray-900">{p.name}</h3>
              <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-teal-700">
                {p.price}<span className="text-sm font-medium text-gray-400">{p.per ?? ""}</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <Check size={13} className="mt-0.5 shrink-0 text-teal-600" />{f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`neu-pressable mt-5 rounded-2xl px-4 py-2 text-center text-xs font-semibold ${
                  p.featured
                    ? "bg-gradient-to-b from-teal-600 to-teal-700 text-white shadow-[0_8px_20px_-8px_rgba(15,118,110,0.6)]"
                    : "glass-strong text-gray-700"
                }`}
              >
                {p.name === "Enterprise" ? "Contact us" : "Start Free"}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="mt-10 border-t border-white/50 bg-white/30 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-gray-500">
          <span className="flex items-center gap-2">
            <KawaniMark size={26} />
            <span>© {new Date().getFullYear()} <b className="text-[#0e2a47]">Kawani</b> <b className="text-teal-600">AI</b> · Built for Philippine SMEs</span>
          </span>
          <nav className="flex gap-5">
            <a href="#" className="hover:text-gray-900">Privacy Policy</a>
            <a href="#" className="hover:text-gray-900">Terms</a>
            <a href="mailto:hello@kawani.ai" className="hover:text-gray-900">Contact</a>
            <Link href="/login" className="hover:text-gray-900">Login</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
