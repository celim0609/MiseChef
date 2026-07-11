export const AI_PRICING = {
  google: {
    "gemini-2.5-flash": {
      inputPerMillionTokens: 0,
      outputPerMillionTokens: 0,
      currency: "USD",
      effectiveDate: ""
    }
  }
} as const;

export type AiPricingProvider = keyof typeof AI_PRICING;
export type AiPricingModel<TProvider extends AiPricingProvider> = keyof typeof AI_PRICING[TProvider];
