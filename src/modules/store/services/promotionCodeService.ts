import { httpsCallable } from "firebase/functions";
import { functions } from "../../../firebase";
import type { CartSelection } from "../types";
import type {
  CodeRedemption,
  PromotionCodeConfig,
  PromotionCodeSnapshot,
} from "../promotionCodeTypes";
const call = async <T>(name: string, input: unknown): Promise<T> => {
  if (!functions)
    throw new Error("Promotion codes are temporarily unavailable.");
  return (await httpsCallable<unknown, T>(functions, name)(input)).data;
};
export const promotionCodeService = {
  list: (workspaceId: string) =>
    call<{ codes: PromotionCodeConfig[] }>("manageStorePromotionCodes", {
      workspaceId,
      action: "list",
    }),
  save: (workspaceId: string, config: PromotionCodeConfig) =>
    call<{ code: PromotionCodeConfig }>("manageStorePromotionCodes", {
      workspaceId,
      action: "save",
      ...(config.id ? { id: config.id } : {}),
      config,
    }),
  disable: (workspaceId: string, id: string) =>
    call<{ code: PromotionCodeConfig }>("manageStorePromotionCodes", {
      workspaceId,
      action: "disable",
      id,
    }),
  history: (workspaceId: string, id: string) =>
    call<{ redemptions: CodeRedemption[] }>("manageStorePromotionCodes", {
      workspaceId,
      action: "history",
      id,
    }),
  preview: (
    slug: string,
    promotionCode: string,
    selections: CartSelection[],
    serviceDate: string,
    groupShareCode?: string,
  ) =>
    call<{ snapshot: PromotionCodeSnapshot }>(
      "previewPublicStorePromotionCode",
      {
        slug,
        order: {
          promotionCode,
          selections,
          serviceDate,
          ...(groupShareCode ? { groupShareCode } : {}),
        },
      },
    ),
};
