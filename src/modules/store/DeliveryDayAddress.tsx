import React, { useEffect, useRef, useState } from 'react';
import { getSelectedPlace, searchMalaysiaPlaces, type PlaceSuggestion } from './services/googlePlaces';
import type { DeliveryDestination } from './services/deliveryService';

export default function DeliveryDayAddress({ date, value, onChange }: { date: string; value?: DeliveryDestination; onChange: (value?: DeliveryDestination) => void }) {
  const [custom, setCustom] = useState(Boolean(value));
  const [query, setQuery] = useState(value?.formattedAddress || '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [error, setError] = useState('');
  const session = useRef(crypto.randomUUID());
  const generation = useRef(0);
  useEffect(() => {
    if (!custom || query.length < 3 || value?.latitude) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void searchMalaysiaPlaces(query, session.current, controller.signal).then(setSuggestions).catch(e => { if (!controller.signal.aborted) setError(e.message); }); }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, custom, value]);
  return <div className="mt-3 space-y-2">
    <label><input type="checkbox" checked={custom} onChange={event => { generation.current++; setCustom(event.target.checked); onChange(event.target.checked ? { formattedAddress: '', latitude: '', longitude: '' } : undefined); }} /> Different delivery address for {date}</label>
    {custom && <><input aria-label={`Search address for ${date}`} value={query} placeholder="Search delivery location" onChange={event => { generation.current++; setQuery(event.target.value); setError(''); onChange({ formattedAddress: '', latitude: '', longitude: '' }); }} className="w-full rounded-lg border p-2" />
      {!value?.latitude && suggestions.map(suggestion => <button type="button" key={suggestion.placeId} className="block rounded border p-2" onClick={async () => { const request = ++generation.current; try { const place = await getSelectedPlace(suggestion.placeId, session.current); if (request !== generation.current) return; onChange(place); setQuery(place.formattedAddress); setSuggestions([]); session.current = crypto.randomUUID(); } catch(e) { setError(e instanceof Error ? e.message : 'Unable to select address.'); } }}>{suggestion.label}</button>)}
      {value?.latitude && <label className="block">Full address, including unit / floor<textarea required aria-label={`Full address for ${date}`} maxLength={500} value={value.formattedAddress} onChange={event => onChange({ ...value, formattedAddress: event.target.value })} className="block w-full rounded border p-2" /></label>}
      {error && <p role="alert">{error}</p>}</>}
  </div>;
}
