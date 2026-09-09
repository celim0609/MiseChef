export type PlaceSuggestion = {
  placeId: string;
  label: string;
  primaryText: string;
  secondaryText: string;
};

export type SelectedPlace = {
  formattedAddress: string;
  latitude: string;
  longitude: string;
};

type PlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }>;
};

type PlaceDetailsResponse = {
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

const PLACES_API = 'https://places.googleapis.com/v1';
const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY?.trim() || '';

const requireApiKey = () => {
  if (!apiKey) throw new Error('Address search is temporarily unavailable.');
  return apiKey;
};

const readError = async (response: Response) => {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return payload.error?.message || 'Address search is temporarily unavailable.';
};

export const searchMalaysiaPlaces = async (input: string, sessionToken: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> => {
  if (input.trim().length < 3) return [];
  const response = await fetch(`${PLACES_API}/places:autocomplete`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': requireApiKey(),
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat'
    },
    body: JSON.stringify({ input: input.trim(), includedRegionCodes: ['my'], languageCode: 'en', regionCode: 'MY', sessionToken })
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json() as PlacesAutocompleteResponse;
  return (payload.suggestions || []).flatMap(({ placePrediction }) => {
    const placeId = placePrediction?.placeId || '';
    const label = placePrediction?.text?.text || '';
    if (!placeId || !label) return [];
    return [{
      placeId,
      label,
      primaryText: placePrediction?.structuredFormat?.mainText?.text || label,
      secondaryText: placePrediction?.structuredFormat?.secondaryText?.text || ''
    }];
  });
};

export const getSelectedPlace = async (placeId: string, sessionToken: string, signal?: AbortSignal): Promise<SelectedPlace> => {
  const response = await fetch(`${PLACES_API}/places/${encodeURIComponent(placeId)}?languageCode=en&sessionToken=${encodeURIComponent(sessionToken)}`, {
    signal,
    headers: { 'X-Goog-Api-Key': requireApiKey(), 'X-Goog-FieldMask': 'formattedAddress,location' }
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json() as PlaceDetailsResponse;
  const latitude = payload.location?.latitude;
  const longitude = payload.location?.longitude;
  if (!payload.formattedAddress || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Choose an address with a map location.');
  return { formattedAddress: payload.formattedAddress, latitude: String(latitude), longitude: String(longitude) };
};
