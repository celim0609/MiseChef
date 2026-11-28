import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import {
  compareSmartDelivery,
  loadPlannerOrders,
} from "./smartDeliveryPlanner.js";
import { loadReviewStore } from "./groupDeliveryReview.js";
import { requireGroupDeliveryBeta, requireCustomer } from "./groupDelivery.js";
import {
  createGroupDeliveryPlaces,
  consumeGroupDeliveryRate,
} from "./groupDeliveryPlaces.js";
import { createLalamoveProvider } from "./lalamoveSandbox.js";
const lalamoveApiKey = defineSecret("LALAMOVE_API_KEY");
const lalamoveApiSecret = defineSecret("LALAMOVE_API_SECRET");
const projectId =
  process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const assertGroupDeliveryProject = () => requireGroupDeliveryBeta(projectId);
const groupDeliveryOptions = {
  region: "us-central1",
  invoker: "public",
  maxInstances: 5,
};
const groupDeliveryCall = (options, handler) =>
  projectId === "misechef-beta-fa4bf"
    ? onCall(options, handler)
    : () => {
        throw new HttpsError(
          "failed-precondition",
          "Smart Delivery is available on Beta only.",
        );
      };
const createRuntimeLalamoveProvider = () =>
  createLalamoveProvider({
    environment: "sandbox",
    apiKey: lalamoveApiKey.value(),
    apiSecret: lalamoveApiSecret.value(),
  });
export const planMiseChefSmartDelivery = groupDeliveryCall(
  {
    ...groupDeliveryOptions,
    timeoutSeconds: 540,
    secrets: [lalamoveApiKey, lalamoveApiSecret],
  },
  async (request) => {
    assertGroupDeliveryProject();
    requireCustomer(request.auth?.uid);
    const db = getFirestore();
    const args = {
      db,
      uid: request.auth.uid,
      storeId: request.data?.storeId,
      workspaceId: request.data?.workspaceId,
    };
    await loadReviewStore(args);
    await consumeGroupDeliveryRate({ db, uid: request.auth.uid });
    if (request.data?.action === "orders")
      return loadPlannerOrders({
        ...args,
        date: request.data.date,
        limits: request.data.limits,
      });
    const places = createGroupDeliveryPlaces();
    if (request.data?.action === "search") {
      const input = request.data.input,
        sessionToken = request.data.sessionToken;
      if (
        typeof input !== "string" ||
        input.trim().length < 3 ||
        input.length > 200 ||
        typeof sessionToken !== "string" ||
        !/^[\w-]{1,64}$/.test(sessionToken)
      )
        throw new HttpsError("invalid-argument", "Enter an address.");
      return {
        suggestions: await places.search(input.trim(), "en", sessionToken),
      };
    }
    if (request.data?.action !== "compare")
      throw new HttpsError("invalid-argument", "Choose a planner action.");
    return compareSmartDelivery({
      ...args,
      projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
      input: request.data.plan,
      provider: createRuntimeLalamoveProvider(),
      resolvePlace: (placeId) => places.resolve(placeId),
    });
  },
);
