import { useEffect, useRef, useState } from 'react';
import { getSelectedPlace, searchMalaysiaPlaces, type PlaceSuggestion } from './services/googlePlaces';
import type { PosDestination } from './posOrderEntryModel';

export default function PosAddressPicker({label,value,onChange,disabled=false}:{label:string;value?:PosDestination;onChange:(value:PosDestination)=>void;disabled?:boolean}) {
  const [search,setSearch]=useState('');
  const [suggestions,setSuggestions]=useState<PlaceSuggestion[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const generation=useRef(0);
  const session=useRef(crypto.randomUUID());
  useEffect(()=>{
    if(search.trim().length<3 || disabled) return;
    const controller=new AbortController();
    const request=++generation.current;
    const timer=setTimeout(()=>{setLoading(true); void searchMalaysiaPlaces(search,session.current,controller.signal).then(items=>{if(request===generation.current)setSuggestions(items);}).catch(e=>{if(request===generation.current&&!controller.signal.aborted)setError(e.message);}).finally(()=>{if(request===generation.current)setLoading(false);});},300);
    return ()=>{clearTimeout(timer);controller.abort();generation.current++;};
  },[search,disabled]);
  return <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <legend className="px-1 text-xs font-bold">{label}</legend>
    <label className="block text-xs font-bold">Search Malaysia address<input aria-label={`Search ${label}`} value={search} autoComplete="off" onChange={e=>{generation.current++;setSearch(e.target.value);setSuggestions([]);setError('');setLoading(false);}} className="mt-1 block w-full rounded-lg border bg-white p-2 text-sm" placeholder="Search location in Malaysia" /></label>
    {loading&&<p role="status" className="text-xs">Searching…</p>}
    {suggestions.map(suggestion=><button type="button" key={suggestion.placeId} className="block w-full rounded border bg-white p-2 text-left text-sm" onClick={async()=>{const request=++generation.current;setLoading(true);try{const place=await getSelectedPlace(suggestion.placeId,session.current);if(request!==generation.current)return;onChange({...place,placeId:suggestion.placeId});setSuggestions([]);setSearch('');session.current=crypto.randomUUID();}catch(e){if(request===generation.current)setError(e instanceof Error?e.message:'Choose another address.');}finally{if(request===generation.current)setLoading(false);}}}>{suggestion.label}</button>)}
    <label className="block text-xs font-bold">Full address / unit / floor<textarea aria-label={label} value={value?.formattedAddress || ''} maxLength={500} onChange={e=>onChange({...value,formattedAddress:e.target.value,latitude:value?.latitude || '',longitude:value?.longitude || ''})} className="mt-1 block w-full rounded-lg border bg-white p-2 text-sm" /></label>
    <p className="text-xs text-slate-500">{value?.placeId?'Map location selected. Address corrections keep this location. Select another search result to change it.':'Choose a search result for an estimate. A manual fee is available to Owner/Manager if search or quotation is unavailable.'}</p>
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  </fieldset>;
}
