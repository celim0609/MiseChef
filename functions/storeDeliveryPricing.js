// Customer fee policy only. Provider quote prices and dispatch stay authoritative.
const minor = value => Math.round(Number(value) * 100);
const money = value => value / 100;
export const deliveryDistanceKm = (from, to) => {
  const valid = point => point && [point.latitude, point.longitude].every(value => value !== '' && value != null && Number.isFinite(Number(value)))
    && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180;
  if (!valid(from) || !valid(to)) throw new Error('Delivery coordinates are invalid.');
  const radians = value => Number(value) * Math.PI / 180;
  const dLat = radians(Number(to.latitude) - Number(from.latitude));
  const dLng = radians(Number(to.longitude) - Number(from.longitude));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
};
export const validFreeDelivery = value => value && typeof value.enabled === 'boolean'
  && Number.isFinite(value.distanceThresholdKm) && value.distanceThresholdKm > 0 && value.distanceThresholdKm <= 500
  && [value.minimumSubtotalWithin, value.minimumSubtotalBeyond].every(amount => Number.isFinite(amount) && amount >= 0 && amount <= 100000);

export const calculateDeliveryDayPricing = ({ config, providerFee, items, fulfilments, pickup, destination, promotionPricing, date = '' }) => {
  if (!Number.isFinite(providerFee) || providerFee < 0) throw new Error('Invalid provider delivery fee.');
  const free = config.freeDelivery;
  if (free?.enabled === true && !validFreeDelivery(free)) throw new Error('Invalid free delivery settings.');
  const distanceKm = free?.enabled === true ? deliveryDistanceKm(pickup, destination) : null;
  const entries = fulfilments?.length ? fulfilments : [{ date, allocations: items.map((item, itemIndex) => ({ itemIndex })) }];
  const { discountedMerchandiseTotal, promotionSnapshot } = promotionPricing;
  const discountedTotalMinor = minor(discountedMerchandiseTotal);
  if (!Number.isSafeInteger(discountedTotalMinor) || discountedTotalMinor < 0) throw new Error('Invalid discounted merchandise total.');
  const subtotalMinor = entries.map(() => 0);
  const lines = promotionSnapshot.lineAdjustments;
  if (entries.length > 1 && (lines.length !== items.length || lines.reduce((sum, line) => sum + minor(line.finalLineTotal), 0) !== discountedTotalMinor)) throw new Error('Discounted merchandise allocations do not match the order total.');
  // Allocate canonical discounted lines, including a weekly plan across its five days.
  items.forEach((item, itemIndex) => {
    const indexes = entries.flatMap((entry, index) => entry.allocations.some(allocation => allocation.itemIndex === itemIndex) ? [index] : []);
    if (!indexes.length) throw new Error('Delivery item has no service day.');
    const total = entries.length === 1 ? 0 : minor(lines[itemIndex].finalLineTotal);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid service-day merchandise subtotal.');
    if (item.mealOptionDays?.length) {
      const extras = indexes.map(index => (item.mealOptionDays.find(day => day.serviceDate === entries[index].date)?.optionSurchargeUnitMinor || 0) * item.quantity);
      // Promotion V1 discounts only the base price. Keep that discount on the
      // existing equal base allocation; a day's options stay on that day.
      const discountedBase = total - extras.reduce((sum, amount) => sum + amount, 0);
      if (!Number.isSafeInteger(discountedBase) || discountedBase < 0) throw new Error('Invalid service-day base total.');
      const share = Math.floor(discountedBase / indexes.length);
      indexes.forEach((index, offset) => { subtotalMinor[index] += share + (offset < discountedBase % indexes.length ? 1 : 0) + extras[offset]; });
      return;
    }
    const share = Math.floor(total / indexes.length);
    indexes.forEach((index, offset) => { subtotalMinor[index] += share + (offset < total % indexes.length ? 1 : 0); });
  });
  if (entries.length === 1) subtotalMinor[0] = discountedTotalMinor;
  const subsidy = config.subsidy || {};
  // Preserve the existing single-day subsidy and multi-day quote multiplier.
  const subsidyApplied = entries.length === 1 && subsidy.enabled === true && discountedMerchandiseTotal >= Number(subsidy.minimumMerchandiseSpend || 0);
  const baseFee = subsidyApplied ? Math.min(providerFee, Number(subsidy.maximumCustomerDeliveryCharge || 0)) : providerFee;
  const minimum = free?.enabled === true ? (distanceKm <= free.distanceThresholdKm ? free.minimumSubtotalWithin : free.minimumSubtotalBeyond) : null;
  const days = entries.map((entry, index) => {
    const freeDeliveryApplied = minimum !== null && money(subtotalMinor[index]) >= minimum;
    return { date: entry.date, merchandiseSubtotal: money(subtotalMinor[index]), customerDeliveryFee: freeDeliveryApplied ? 0 : money(minor(baseFee)), freeDeliveryApplied };
  });
  return { days, distanceKm, customerDeliveryFee: money(days.reduce((sum, day) => sum + minor(day.customerDeliveryFee), 0)) };
};
