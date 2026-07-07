-- Plan tier drives AI routing: free = Groq only, premium/enterprise unlock OpenAI/Claude task engines.
alter table companies add column if not exists plan text not null default 'premium'
  check (plan in ('free', 'premium', 'enterprise'));
