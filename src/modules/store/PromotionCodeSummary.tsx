import type { PromotionCodeSnapshot } from "./promotionCodeTypes";
export default function PromotionCodeSummary({
  snapshot,
}: {
  snapshot: PromotionCodeSnapshot;
}) {
  return (
    <div
      aria-label="Promotion code discount"
      className="min-w-0 space-y-0.5 break-words rounded-lg bg-surface-container-low px-3 py-2 text-xs leading-snug"
    >
      <p className="font-bold text-primary">
        Code {snapshot.code} · {snapshot.percentage}% off eligible products
      </p>
      <p>
        Maximum RM{(snapshot.capMinor / 100).toFixed(2)} · <span className="font-bold text-primary">Discount −RM
        {(snapshot.discountMinor / 100).toFixed(2)}</span>
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
