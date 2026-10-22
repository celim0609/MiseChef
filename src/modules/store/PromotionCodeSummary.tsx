import type { PromotionCodeSnapshot } from "./promotionCodeTypes";
export default function PromotionCodeSummary({
  snapshot,
}: {
  snapshot: PromotionCodeSnapshot;
}) {
  return (
    <div
      aria-label="Promotion code discount"
      className="rounded-xl bg-surface-container-low p-3 text-sm"
    >
      <p className="font-bold">
        Code {snapshot.code} · {snapshot.percentage}% off eligible products
      </p>
      <p>
        Maximum RM{(snapshot.capMinor / 100).toFixed(2)} · Discount −RM
        {(snapshot.discountMinor / 100).toFixed(2)}
        {snapshot.capApplied ? " (cap applied)" : ""}
      </p>
      <p>
        Products after code: RM
        {(snapshot.finalMerchandiseMinor / 100).toFixed(2)}. Delivery fees
        excluded.
      </p>
    </div>
  );
}
