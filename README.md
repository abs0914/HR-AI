# HR AI — Your AI HR Officer for Philippine SMEs

An AI-first HR operations platform for small and medium businesses in the Philippines. Talk to **Kawani AI** by chat, voice, or file upload to manage employees, generate HR documents (DOCX/PDF), summarize attendance, prepare payroll exports (XLSX/CSV), analyze resumes, and track compliance reminders — with role-based access control, human approval workflows, and full audit logging.

## Stack

- **Frontend/Backend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database/Auth/Storage:** Supabase (PostgreSQL + Row Level Security)
- **AI:** OpenAI (chat with tool-calling, Whisper for voice transcription)
- **Files:** `docx`, `pdf-lib`, `xlsx` for DOCX/PDF/XLSX/CSV generation; `pdf-parse` + `mammoth` for text extraction

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This creates all tables, indexes, RLS policies, helper functions, the `documents` storage bucket, and 13 default Philippine HR document templates.
3. (Recommended for local testing) In **Authentication → Providers → Email**, disable "Confirm email" so signup logs you in immediately.

### 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page ("anon public") |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page ("service_role" — keep secret) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | Optional, defaults to `gpt-4o-mini` |
| `APP_URL` | `http://localhost:3000` for local dev |

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### 4. Demo walkthrough

1. **Sign up** → complete **company onboarding** (you become the Owner).
2. On the dashboard, click **Load demo data** — adds 5 demo employees (Maria Santos, Juan Dela Cruz, Ana Reyes, Mark Villanueva, Carla Lopez), 10 days of attendance with lates/absences, 4 leave requests, compliance reminders, and sample documents.
3. Open **Ask Kawani AI** and try:
   - "Who was late today?"
   - "Generate a COE for Juan Dela Cruz."
   - "Show employees due for regularization."
   - "Create a memo about attendance policy."
   - "Generate payroll summary for this cutoff." then "Export it to XLSX." → creates a **pending approval**
4. Approve/reject AI actions on the **Approvals** page (or inline in chat). Everything lands in **Audit Logs**.
5. Upload a resume on **Recruitment** (or via the chat paperclip) and ask "Analyze this applicant for a cashier role."

## Architecture notes

- **RBAC:** roles are `owner`, `hr_admin`, `manager`, `accountant`, `employee`. Postgres RLS scopes every table by company and role (managers see only their team, employees only themselves). The app layer adds column-level salary masking ([src/lib/rbac.ts](src/lib/rbac.ts)) since RLS is row-level only. Every server action and API route re-checks permissions.
- **Agent:** [src/app/api/chat/route.ts](src/app/api/chat/route.ts) runs an OpenAI tool-calling loop (max 6 turns) over ~20 backend tools ([src/lib/agent/tools.ts](src/lib/agent/tools.ts)). Read tools run with the user's RLS-scoped client; sensitive writes (create employee, approve leave, payroll export…) create **pending `ai_actions`** that only execute after a human with approval rights signs off.
- **Documents:** templates live in `document_templates` (`{{variable}}` placeholders; company templates override global defaults). Generated files are stored as DOCX + PDF in Supabase Storage under `company_id/employee_id/document_type/`, recorded in `employee_documents` as **drafts**, and re-exportable in either format from the stored text.
- **Audit:** `audit_logs` inserts go through the service role only (no client insert policy), so entries can't be forged or skipped; reads are Owner/HR Admin only.
- **Voice:** browser MediaRecorder → `/api/transcribe` (Whisper) → text lands in the chat input for editing before send. Falls back to "Voice input is unavailable" if mic or API access fails.

## Disclaimers

HR AI provides template-based drafts and reminders only — **not legal advice**. Disciplinary and employment documents should be reviewed by qualified HR/legal professionals before use.
