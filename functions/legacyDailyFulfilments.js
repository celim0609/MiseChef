// Only recover schedules explicitly recorded in purchased line snapshots.
// Mixed dated/undated or unscheduled weekly parents require operator review.
export function legacyDailyFulfilments(order) {
  if (
    order.fulfilments?.length ||
    order.weeklyFulfilments?.length ||
    !order.items?.length
  )
    return null;
  const dates = order.items.map(
    (item) => item.healthyLunchSnapshot?.date || "",
  );
  if (
    !dates.some(Boolean) ||
    dates.some(
      (date) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date,
    ) ||
    order.items.some((item) => item.weeklyPlanSnapshot)
  )
    return null;
  return [...new Set(dates)]
    .sort()
    .map((date) => ({
      id: `legacy_${date.replaceAll("-", "")}`,
      date,
      time: order.pickupTime || order.delivery?.schedule?.time || "",
      method: order.fulfilmentMethod || "pickup",
      pickupLocationId: order.pickupLocationId || "",
      pickupLocationName: order.pickupLocationName || "",
      pickupLocationAddress: order.pickupLocationAddress || "",
      allocations: order.items.flatMap((item, itemIndex) =>
        dates[itemIndex] === date
          ? [{ itemIndex, quantity: item.quantity }]
          : [],
      ),
    }));
}
