export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type UsageRow = TokenUsage & {
  companyId: string;
  companyName: string;
  provider: string;
  model: string;
  calls: number;
};

export function extractTokenUsage(metadata: any): TokenUsage {
  const usage = metadata?.usage ?? {};
  const inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export function aggregateAiMessages(
  messages: any[],
  companyNames: Map<string, string>
): { totals: TokenUsage & { calls: number }; rows: UsageRow[] } {
  const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 };
  const rows = new Map<string, UsageRow>();

  for (const message of messages) {
    const usage = extractTokenUsage(message.metadata);
    if (usage.totalTokens <= 0) continue;
    const companyId = message.company_id ?? "unknown";
    const provider = message.metadata?.provider ?? "unknown";
    const model = message.metadata?.model ?? "unknown";
    const key = `${companyId}:${provider}:${model}`;

    const row = rows.get(key) ?? {
      companyId,
      companyName: companyNames.get(companyId) ?? "Unknown company",
      provider,
      model,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    row.calls += 1;
    row.inputTokens += usage.inputTokens;
    row.outputTokens += usage.outputTokens;
    row.totalTokens += usage.totalTokens;
    rows.set(key, row);

    totals.calls += 1;
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
    totals.totalTokens += usage.totalTokens;
  }

  return {
    totals,
    rows: [...rows.values()].sort((a, b) => b.totalTokens - a.totalTokens),
  };
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PH").format(value);
}
