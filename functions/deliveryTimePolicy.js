// Delivery wall-clock hours are independent of Store opening and pickup sessions.
export const isClockTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const validDeliveryHours = hours => Boolean(hours && isClockTime(hours.from) && isClockTime(hours.to) && hours.from < hours.to);
export const isDeliveryTimeWithinHours = (time, hours) => validDeliveryHours(hours) && isClockTime(time) && time >= hours.from && time <= hours.to;
export const deliveryTimeSlots = hours => {
  if (!validDeliveryHours(hours)) return [];
  const minutes = value => Number(value.slice(0,2)) * 60 + Number(value.slice(3));
  const slots = [];
  for (let n = minutes(hours.from); n <= minutes(hours.to); n += 15) slots.push(`${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`);
  if (slots.at(-1) !== hours.to) slots.push(hours.to);
  return slots;
};
