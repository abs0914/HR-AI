import Link from "next/link";
import { KawaniLogo } from "@/components/logo";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-gray-700">
      <Link href="/" className="inline-flex"><KawaniLogo size={38} tagline /></Link>
      <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-[#0e2a47]">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: July 9, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-bold text-gray-900">Who We Are</h2>
          <p>Kawani AI is an HR operations SaaS for Philippine businesses. The service is powered by PhilVirtualOffice Business Support Services and helps companies manage employee records, HR documents, attendance, leave, payroll preparation, compliance reminders, recruitment, and AI-assisted HR workflows.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Information We Process</h2>
          <p>We process account details, company profile data, user roles, employee 201-file records, attendance, leave, payroll preparation data, uploaded files, generated HR documents, applicant resumes, policy knowledge base content, chat messages, AI tool traces, approval decisions, audit logs, billing metadata, and support communications.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">How We Use Information</h2>
          <p>We use data to provide the HR workspace, authenticate users, enforce role-based access, generate draft HR outputs, maintain audit logs, process payments through PayMongo, improve reliability and security, provide support, and comply with legal or regulatory obligations.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">AI Processing</h2>
          <p>When users ask Kawani AI to answer questions, analyze files, summarize records, or draft documents, relevant context may be sent to configured AI providers such as Groq, OpenAI, Anthropic, or Hermes-connected tools. AI outputs are drafts and must be reviewed by qualified HR, legal, accounting, or management personnel before use.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Legal Basis And Data Privacy Act</h2>
          <p>For Philippine users, processing may be based on legitimate business purposes, contract performance, legal obligations, consent where required, and employer HR administration under the Data Privacy Act of 2012 and related rules. Customer companies remain responsible for lawful collection and use of their employees' personal information.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Sharing And Subprocessors</h2>
          <p>We share data only as needed to operate the service, including Supabase for database/auth/storage, AI providers for requested AI tasks, PayMongo for payments, infrastructure providers, and support/security tools. We do not sell employee personal data.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Security And Retention</h2>
          <p>We use row-level security, role-based access, private document storage, approval workflows, audit logs, and server-side permission checks. Data is retained while the workspace is active or as needed for legal, billing, backup, dispute, or audit purposes. Customers may request export or deletion subject to operational and legal limits.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Your Rights</h2>
          <p>Depending on your role and applicable law, you may request access, correction, deletion, portability, objection, or withdrawal of consent. Employees should first contact their employer, who controls the workspace data. Account owners may contact support for workspace-level requests.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Contact</h2>
          <p>For privacy requests, contact <a className="text-teal-700 underline" href="mailto:hello@kawani.ai">hello@kawani.ai</a>.</p>
        </section>
      </div>
    </main>
  );
}
