import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import PromotionCodeSummary from "./PromotionCodeSummary";
import PaymentOrderSummary from "./PaymentOrderSummary";
import { mytInputValue, mytInputToIso } from "./promotionCodeDates";
import type { PromotionCodeSnapshot } from "./promotionCodeTypes";
const snapshot: PromotionCodeSnapshot = {
  version: 1,
  codeId: "code",
  code: "WELCOME20",
  percentageBps: 2000,
  percentage: 20,
  capMinor: 500,
  membersOnly: true,
  dailyLimit: 1,
  totalLimit: null,
  businessDate: "2026-10-22",
  resetTimeZone: "Asia/Kuala_Lumpur",
  conflictPolicy: "A",
  eligibleSubtotalMinor: 3000,
  uncappedDiscountMinor: 600,
  discountMinor: 500,
  capApplied: true,
  finalMerchandiseMinor: 2500,
  currency: "MYR",
  configRevision: 1,
};
test("code and payment summary clearly show percentage, cap, discount and unchanged delivery fee", () => {
  const summary = renderToStaticMarkup(
    <PromotionCodeSummary snapshot={snapshot} />,
  );
  for (const value of [
    "WELCOME20",
    "20%",
    "RM5.00",
    "cap applied",
    "RM25.00",
    "Delivery fees excluded",
  ])
    assert.ok(summary.includes(value));
  const html = renderToStaticMarkup(
    <PaymentOrderSummary
      summary={{
        fulfilmentMethod: "delivery",
        items: [],
        promotionCodeSnapshot: snapshot,
        totals: {
          merchandiseSubtotal: 30,
          discountTotal: 5,
          discountedMerchandiseTotal: 25,
          deliveryFee: 7,
          grandTotal: 32,
          currency: "MYR",
        },
      }}
    />,
  );
  assert.match(html, /WELCOME20/);
  assert.match(html, /32.00/);
  assert.match(html, /7.00/);
});
test("admin validity inputs use explicit Malaysia time, independent of browser timezone", () => {
  assert.equal(mytInputValue("2026-10-22T16:00:00.000Z"), "2026-10-23T00:00");
  assert.equal(mytInputToIso("2026-10-23T00:00"), "2026-10-22T16:00:00.000Z");
  assert.equal(mytInputToIso(""), null);
});
test("checkout re-applies code after pricing inputs change, prevents stale previews, and submits no member identity claim", () => {
  const source = readFileSync(
    new URL("./PublicStorePage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /promotionCodePreview\?\.binding===promotionCodeBinding/,
  );
  assert.match(source, /promotionCodeInput\.trim\(\) && !appliedPromotionCode/);
  assert.match(source, /promotionCode:appliedPromotionCode.code/);
  assert.match(source, /appliedPromotionCode\?\.code\]\)/);
  const service = readFileSync(
    new URL("./services/promotionCodeService.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(service, /customerUid|memberUid|email:|phone:/);
});
