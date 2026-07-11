import Link from "next/link";
import { KawaniLogo } from "@/components/logo";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-gray-700">
      <Link href="/" className="inline-flex"><KawaniLogo size={38} tagline /></Link>
      <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-[#0e2a47]">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: July 9, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7">
        <section>
          <h2 className="text-lg font-bold text-gray-900">Service</h2>
          <p>Kawani AI provides HR software for Philippine businesses, including employee records, documents, attendance, leave, payroll preparation, recruitment workflows, compliance reminders, and AI-assisted HR operations. The service is powered by PhilVirtualOffice Business Support Services.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Accounts And Company Workspaces</h2>
          <p>Each account is intended to manage one company workspace. Owners are responsible for inviting users, assigning roles, maintaining accurate company data, and ensuring users are authorized to access employee or payroll information.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Plans, Limits, And Billing</h2>
          <p>Free, Core, Business, Pro, and Enterprise plans have different employee limits, feature access, AI capabilities, and support levels. Self-serve paid plans are billed per employee through PayMongo. Enterprise pricing is custom. We may suspend paid features if payment fails, expires, is reversed, or cannot be verified.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">AI Outputs Are Drafts</h2>
          <p>AI-generated answers, summaries, payroll preparation outputs, final-pay calculations, document drafts, resume analyses, and compliance reminders are informational drafts only. They are not legal, tax, accounting, labor, or professional advice. Customers must review outputs before relying on or issuing them.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Customer Responsibilities</h2>
          <p>Customers are responsible for lawful data collection, employee notices and consents, policy accuracy, payroll and statutory compliance, HR/legal review, account security, role assignments, uploaded file content, and all actions approved in the workspace.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Acceptable Use</h2>
          <p>You may not use the service to violate law, discriminate unlawfully, bypass role permissions, upload malicious files, extract data you are not authorized to access, interfere with the platform, reverse engineer protected systems, or use AI outputs for harmful or deceptive purposes.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Availability And Changes</h2>
          <p>We aim to provide reliable service but do not guarantee uninterrupted availability. Features, limits, integrations, AI providers, and pricing may change with notice where appropriate. Enterprise agreements may include separate terms or SLAs.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Limitation Of Liability</h2>
          <p>To the maximum extent allowed by law, Kawani AI and PhilVirtualOffice Business Support Services are not liable for indirect, incidental, special, consequential, punitive, or lost-profit damages, or for decisions made from unreviewed AI-generated drafts.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900">Contact</h2>
          <p>For support or contract questions, contact <a className="text-teal-700 underline" href="mailto:hello@kawani.ai">hello@kawani.ai</a>.</p>
        </section>
      </div>
    </main>
  );
}
