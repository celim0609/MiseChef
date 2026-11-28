import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type * as PlannerModule from "./SmartDeliveryPlanner";
import type {
  PlannerComparison,
  PlannerPreview,
} from "./services/smartDeliveryService";
// Match the existing Node/tsx component-test harness. Render the actual module,
// replacing only its network boundary; importing the Vite Firebase client in
// Node would initialize an unrelated browser runtime before assertions run.
const source = readFileSync(
  new URL("./SmartDeliveryPlanner.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;
const componentExports = {} as typeof PlannerModule;
const noNetwork = () => {
  throw new Error("Rendering must not call the delivery service.");
};
new Function("require", "exports", compiled)((name: string) => {
  if (name === "react") return React;
  if (name === "./services/smartDeliveryService")
    return {
      smartDeliveryService: {
        search: noNetwork,
        orders: noNetwork,
        compare: noNetwork,
      },
    };
  throw new Error(`Unexpected component dependency: ${name}`);
}, componentExports);
const { default: SmartDeliveryPlanner, SmartDeliveryResults } =
  componentExports;
test("internal planner exposes configurable limits and date, without checkout or dispatch controls", () => {
  const html = renderToStaticMarkup(
    <SmartDeliveryPlanner storeId="store" workspaceId="workspace" />,
  );
  for (const label of [
    "Smart Delivery Planner",
    "Pairwise distance (km)",
    "Maximum destinations",
    "Maximum route (min)",
    "Manual address",
    "Existing delivery orders",
    "No minimum meal quantity",
    "customer charges stay unchanged",
  ])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Approve free delivery|Book Lalamove|Pay now/);
});
test("comparison separates provider cost, allocation, assumptions, exposure and expired status", () => {
  const q: PlannerPreview = {
    quotationId: "qa-quote",
    feeMinor: 1200,
    expiresAt: "2026-11-28T00:05:00Z",
    sequence: ["a"],
    providerOptimized: false,
    timing: {
      feasible: true,
      durationMinutes: 12,
      arrivals: [
        {
          id: "a",
          label: "A",
          arrival: "11:10",
          windowStart: "11:00",
          windowEnd: "11:30",
          withinWindow: true,
        },
      ],
    },
    totalMinor: 1400,
    savingsMinor: 600,
    providerSavingsMinor: 800,
    merchantExposureMinor: 0,
    economical: true,
    recommended: true,
    bufferMinor: 200,
    maximumExtraCostMinor: 500,
    allocations: [1400],
  };
  const result: PlannerComparison = {
    createdAt: "2026-11-28T00:00:00Z",
    expiresAt: q.expiresAt,
    draft: {
      date: "2026-11-30",
      pickupTime: "11:00",
      limits: {
        distanceKm: 2,
        slotMinutes: 30,
        maxDestinations: 5,
        maxDurationMinutes: 60,
        legMinutes: 10,
        serviceMinutes: 2,
      },
      destinations: [
        { id: "a", label: "A", windowStart: "11:00", windowEnd: "11:30" },
      ],
    },
    individual: [{ ...q, feeMinor: 2000 }],
    routes: [
      {
        count: 1,
        individualTotalMinor: 2000,
        incrementalMinor: 1200,
        manual: q,
        optimized: null,
      },
    ],
    arrivalBasis: "Planning assumption only",
    pricingNotice: "Sandbox mock values",
  };
  const html = renderToStaticMarkup(
    <SmartDeliveryResults
      result={result}
      now={Date.parse("2026-11-28T00:06:00Z")}
    />,
  );
  for (const label of [
    "Expired",
    "RM12.00",
    "RM2.00",
    "RM14.00",
    "Merchant exposure",
    "RM0.00",
    "Planning assumption only",
    "Sandbox mock values",
    "qa-quote",
    "Customer saving after buffer",
  ])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Eligible for internal review/);
});
