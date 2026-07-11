import { FieldValue } from 'firebase-admin/firestore';

const AI_USAGE_COLLECTION = 'ai_usage';

const MODEL_PRICING_USD_PER_MILLION_TOKENS = {
  'gemini-2.5-flash': {
    prompt: 0.30,
    completion: 2.50
  }
};

const readNumber = value => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const readTokenCount = (...values) => {
  for (const value of values) {
    const count = readNumber(value);
    if (count > 0) return count;
  }

  return 0;
};

export const getAiUsageTokens = response => {
  const metadata = response?.usageMetadata || response?.response?.usageMetadata || {};
  const promptTokens = readTokenCount(
    metadata.promptTokenCount,
    metadata.promptTokens,
    metadata.inputTokenCount,
    metadata.inputTokens
  );
  const completionTokens = readTokenCount(
    metadata.candidatesTokenCount,
    metadata.completionTokenCount,
    metadata.outputTokenCount,
    metadata.outputTokens
  );
  const totalTokens = readTokenCount(
    metadata.totalTokenCount,
    metadata.totalTokens,
    promptTokens + completionTokens
  );

  return {
    promptTokens,
    completionTokens,
    totalTokens
  };
};

export const calculateAiUsageCostsUSD = ({ model, promptTokens, completionTokens }) => {
  const pricing = MODEL_PRICING_USD_PER_MILLION_TOKENS[model];
  if (!pricing) {
    return {
      inputCostUSD: 0,
      outputCostUSD: 0,
      estimatedCostUSD: 0
    };
  }

  const inputCostUSD = Number(((readNumber(promptTokens) / 1_000_000) * pricing.prompt).toFixed(8));
  const outputCostUSD = Number(((readNumber(completionTokens) / 1_000_000) * pricing.completion).toFixed(8));

  return {
    inputCostUSD,
    outputCostUSD,
    estimatedCostUSD: Number((inputCostUSD + outputCostUSD).toFixed(8))
  };
};

export const estimateAiUsageCostUSD = ({ model, promptTokens, completionTokens }) => (
  calculateAiUsageCostsUSD({ model, promptTokens, completionTokens }).estimatedCostUSD
);

const removeUndefinedFields = value => Object.fromEntries(
  Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
);

export const recordAiUsage = async ({
  db,
  userId,
  companyId,
  feature,
  provider = 'gemini',
  model,
  response,
  responseTime,
  status
}) => {
  const tokens = getAiUsageTokens(response);
  const costs = calculateAiUsageCostsUSD({ model, ...tokens });
  const record = removeUndefinedFields({
    userId: userId || 'unknown',
    companyId: companyId || userId || 'unknown',
    feature,
    provider,
    model,
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
    totalTokens: tokens.totalTokens,
    inputCostUSD: costs.inputCostUSD,
    outputCostUSD: costs.outputCostUSD,
    estimatedCostUSD: costs.estimatedCostUSD,
    responseTime: readNumber(responseTime),
    status,
    createdAt: FieldValue.serverTimestamp()
  });

  await db.collection(AI_USAGE_COLLECTION).add(record);
};
