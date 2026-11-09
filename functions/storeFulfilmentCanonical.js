// Read-only compatibility projection. Never use pickupCode as a fulfilment type.
const text = value => typeof value === 'string' ? value.trim() : '';
const method = value => value === 'delivery' || value === 'pickup' ? value : '';
export const canonicalFulfilmentMethod = (order, day) => method(day?.method) || method(order.fulfilmentMethod) || method(order.delivery?.fulfilmentMethod) || (text(order.delivery?.recipient?.address) ? 'delivery' : 'pickup');
export const canonicalOrderFulfilmentLabel = order => {
  const methods = [...new Set((order.fulfilments || []).map(day => canonicalFulfilmentMethod(order, day)))];
  const type = methods.length > 1 ? '' : methods[0] || canonicalFulfilmentMethod(order);
  return type === 'delivery' ? 'Delivery' : type === 'pickup' ? 'Pickup' : 'Mixed fulfilments';
};
export const canonicalFulfilmentDestination = (order, day) => {
  if (day?.destination) return { address: text(day.destination.formattedAddress || day.destination.address), latitude: day.destination.latitude, longitude: day.destination.longitude, instructions: text(day.destination.deliveryInstructions) };
  const recipient = order.delivery?.recipient || {};
  return { address: text(recipient.address), latitude: recipient.latitude, longitude: recipient.longitude, instructions: text(recipient.instructions) };
};
export const canonicalFulfilmentView = (order, day) => {
  const type = canonicalFulfilmentMethod(order, day);
  return { method: type, date: text(day?.date) || text(type === 'delivery' ? order.delivery?.schedule?.date : '') || text(order.pickupDate),
    time: text(day?.time) || text(type === 'delivery' ? order.delivery?.schedule?.time : '') || text(order.pickupTime),
    address: type === 'delivery' ? (order.manualOrder ? text(day?.notes) : canonicalFulfilmentDestination(order, day).address) : text(day?.pickupLocationAddress || order.pickupLocationAddress),
    locationName: type === 'pickup' ? text(day?.pickupLocationName || order.pickupLocationName) : '' };
};
export const normalizeDeliveryPhone = (value, country) => {
  const raw = text(value);
  if (!raw || !/^[+\d\s()-]+$/.test(raw)) return '';
  const compact = raw.replace(/[\s()-]/g, '');
  if (/^\+[1-9]\d{1,14}$/.test(compact)) return compact;
  if (country === 'MY' && /^01\d{8,9}$/.test(compact)) return `+60${compact.slice(1)}`;
  if (country === 'MY' && /^601\d{8,9}$/.test(compact)) return `+${compact}`;
  if (country === 'SG' && /^[689]\d{7}$/.test(compact)) return `+65${compact}`;
  if (country === 'SG' && /^65[689]\d{7}$/.test(compact)) return `+${compact}`;
  return '';
};
const coordinate = (value, max) => (typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '' && value != null && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= max;
// Recover pins only from the exact same saved address; never borrow the global
// pin for a different per-day destination or read today's Store settings.
const savedPin = (point, stop) => {
  if (!text(point.address) || text(point.address) !== text(stop?.address)) return point;
  return { ...point, latitude: point.latitude ?? stop?.coordinates?.lat, longitude: point.longitude ?? stop?.coordinates?.lng };
};
export const resolveDeliveryDispatchData = (order, day) => {
  const delivery = order.delivery || {};
  const firstQuote = order.deliveryPricingSnapshot?.firstQuote || {};
  const quote = { ...firstQuote, ...delivery.quote, serviceType: text(delivery.quote?.serviceType) || text(firstQuote.serviceType), stops: delivery.quote?.stops?.length ? delivery.quote.stops : firstQuote.stops };
  const country = order.country || (order.currency === 'MYR' || delivery.pricing?.currency === 'MYR' ? 'MY' : order.currency === 'SGD' ? 'SG' : '');
  const pickup = savedPin({ ...(delivery.pickup || {}) }, quote.stops?.[0]);
  pickup.contactName = text(pickup.contactName);
  pickup.contactPhoneE164 = normalizeDeliveryPhone(pickup.contactPhoneE164, country);
  const destination = canonicalFulfilmentDestination(order, day);
  const common = delivery.recipient || {};
  const recipient = savedPin({ ...destination, name: text(common.name || order.customerName), phoneE164: normalizeDeliveryPhone(common.phoneE164 || order.phone, country) }, quote.stops?.[1]);
  const issues = [];
  const required = (valid, field, label) => { if (!valid) issues.push({field, label}); };
  required(Boolean(text(quote.serviceType)), 'serviceType', 'delivery vehicle / service type');
  required(Boolean(text(pickup.address)), 'sender.address', 'pickup address');
  required(coordinate(pickup.latitude, 90) && coordinate(pickup.longitude, 180), 'sender.coordinates', 'pickup map coordinates');
  required(Boolean(pickup.contactName), 'sender.name', 'sender contact name');
  required(Boolean(pickup.contactPhoneE164), 'sender.phone', 'sender phone with country code');
  required(Boolean(recipient.address), 'recipients[0].address', 'customer delivery address');
  required(coordinate(recipient.latitude, 90) && coordinate(recipient.longitude, 180), 'recipients[0].coordinates', 'customer delivery map coordinates');
  required(Boolean(recipient.name), 'recipients[0].name', 'recipient contact name');
  required(Boolean(recipient.phoneE164), 'recipients[0].phone', 'recipient phone with country code');
  return { pickup, recipient, serviceType: text(quote.serviceType), issues };
};
export const deliveryBlockedMessage = issues => issues.length ? `Delivery booking blocked: verify ${issues.map(issue => issue.label).join(', ')} against the original order. No booking has been submitted.` : '';
