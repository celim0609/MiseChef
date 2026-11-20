const storeZone = store => store.timeZone || (store.country === 'SG' ? 'Asia/Singapore' : 'Asia/Kuala_Lumpur');
export function posStoreDate(store, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: storeZone(store), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
