const readStatus = error => {
  const candidates = [error?.status, error?.code, error?.error?.code];
  for (const candidate of candidates) {
    const status = Number(candidate);
    if (Number.isInteger(status)) return status;
  }
  const match = String(error?.message || '').match(/\b(429|503)\b/);
  return match ? Number(match[1]) : 0;
};

export const classifyGeminiFailure = error => {
  const reason = String(error?.details?.reason || error?.reason || '').toLowerCase();
  if (reason === 'invalid-json') return { type: 'json_parsing_failure', status: 0 };
  if (reason === 'model-refusal') return { type: 'model_refusal', status: 0 };

  const status = readStatus(error);
  if (status === 429 || status === 503) return { type: 'http_failure', status };

  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (
    message.includes('timeout')
    || message.includes('timed out')
    || message.includes('deadline')
    || code.includes('deadline-exceeded')
  ) return { type: 'timeout', status };

  return { type: 'other', status };
};

const refusalReason = response => {
  const promptBlock = String(response?.promptFeedback?.blockReason || '').trim();
  if (promptBlock) return promptBlock;
  const finishReasons = Array.isArray(response?.candidates)
    ? response.candidates.map(candidate => String(candidate?.finishReason || '').trim()).filter(Boolean)
    : [];
  return finishReasons.find(reason => !['STOP', 'MAX_TOKENS'].includes(reason.toUpperCase())) || '';
};

const defaultSleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

export const generateGeminiJsonWithRetry = async ({
  generate,
  parse,
  onFailure = () => undefined,
  sleep = defaultSleep,
  maxHttpRetries = 3,
  maxJsonRetries = 1,
  initialBackoffMs = 500
}) => {
  let attempts = 0;
  let httpRetries = 0;
  let jsonRetries = 0;

  while (true) {
    attempts += 1;
    try {
      const response = await generate();
      const refusal = refusalReason(response);
      if (refusal) {
        const error = new Error('Gemini model refused the resume extraction request.');
        error.reason = 'model-refusal';
        error.refusalReason = refusal;
        throw error;
      }

      try {
        return { response, parsed: parse(response.text), attempts };
      } catch (error) {
        const failure = classifyGeminiFailure(error);
        if (failure.type !== 'json_parsing_failure') throw error;
        onFailure({ ...failure, attempt: attempts, error });
        if (jsonRetries >= maxJsonRetries) throw error;
        jsonRetries += 1;
        continue;
      }
    } catch (error) {
      const failure = classifyGeminiFailure(error);
      if (failure.type === 'json_parsing_failure') throw error;
      onFailure({ ...failure, attempt: attempts, error });
      if (failure.type !== 'http_failure' || httpRetries >= maxHttpRetries) throw error;
      const delayMs = initialBackoffMs * (2 ** httpRetries);
      httpRetries += 1;
      await sleep(delayMs);
    }
  }
};
