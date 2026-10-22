const TOKENS_PER_MILLION = 1_000_000;

export const IMAGE_PRICING = {
  inputTextUsdPerMillion: 5,
  inputImageUsdPerMillion: 8,
  outputImageUsdPerMillion: 30,
} as const;

type UnknownRecord = Record<string, unknown>;

export interface TokenUsageSummary {
  inputTextTokens?: number;
  inputImageTokens?: number;
  outputImageTokens?: number;
  totalTokens?: number;
}

export interface CostEstimate {
  amountUsd: number;
  currency: "USD";
  breakdown: {
    inputTextUsd: number;
    inputImageUsd: number;
    outputImageUsd: number;
  };
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : undefined;
}

function asTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function firstTokenCount(...values: unknown[]): number | undefined {
  for (const value of values) {
    const tokenCount = asTokenCount(value);
    if (tokenCount !== undefined) {
      return tokenCount;
    }
  }

  return undefined;
}

export function normalizeUsage(value: unknown): TokenUsageSummary | undefined {
  const usage = asRecord(value);

  if (!usage) {
    return undefined;
  }

  const inputDetails = asRecord(usage.input_tokens_details);
  const outputDetails = asRecord(usage.output_tokens_details);
  const summary: TokenUsageSummary = {
    inputTextTokens: firstTokenCount(
      usage.input_text_tokens,
      inputDetails?.text_tokens,
      inputDetails?.input_text_tokens,
    ),
    inputImageTokens: firstTokenCount(
      usage.input_image_tokens,
      inputDetails?.image_tokens,
      inputDetails?.input_image_tokens,
    ),
    outputImageTokens: firstTokenCount(
      usage.output_image_tokens,
      outputDetails?.image_tokens,
      outputDetails?.output_image_tokens,
      usage.output_tokens,
    ),
    totalTokens: firstTokenCount(usage.total_tokens),
  };

  return Object.values(summary).some((tokenCount) => tokenCount !== undefined)
    ? summary
    : undefined;
}

export function calculateImageCost(
  usage: TokenUsageSummary | undefined,
): CostEstimate | undefined {
  if (
    usage?.inputTextTokens === undefined ||
    usage.inputImageTokens === undefined ||
    usage.outputImageTokens === undefined
  ) {
    return undefined;
  }

  const inputTextUsd =
    (usage.inputTextTokens / TOKENS_PER_MILLION) *
    IMAGE_PRICING.inputTextUsdPerMillion;
  const inputImageUsd =
    (usage.inputImageTokens / TOKENS_PER_MILLION) *
    IMAGE_PRICING.inputImageUsdPerMillion;
  const outputImageUsd =
    (usage.outputImageTokens / TOKENS_PER_MILLION) *
    IMAGE_PRICING.outputImageUsdPerMillion;

  return {
    amountUsd: inputTextUsd + inputImageUsd + outputImageUsd,
    currency: "USD",
    breakdown: {
      inputTextUsd,
      inputImageUsd,
      outputImageUsd,
    },
  };
}