import { applicationDefault } from 'firebase-admin/app';
import { HttpsError } from 'firebase-functions/v2/https';

// Reuse Places API (New), with server credentials; no browser key or client pin trust.
export const createGroupDeliveryPlaces = ({ accessToken = async () => (await applicationDefault().getAccessToken()).access_token,
  projectId = 'misechef-beta-fa4bf', fetchImpl = fetch } = {}) => {
  const request = async (path, body, fields) => {
    const token = await accessToken();
    const response = await fetchImpl(`https://places.googleapis.com/v1/${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': projectId,
        'Content-Type': 'application/json', 'X-Goog-FieldMask': fields },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new HttpsError('unavailable', 'Address search unavailable. Please retry. / 地址查询暂不可用，请重试。');
    return response.json();
  };
  return {
    async search(input, language, sessionToken) {
      const data = await request('places:autocomplete', { input, includedRegionCodes: ['my'], languageCode: language === 'zh-CN' ? 'zh-CN' : 'en', regionCode: 'MY', sessionToken }, 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
      return (data.suggestions || []).flatMap(s => s.placePrediction?.placeId ? [{ placeId: s.placePrediction.placeId, label: s.placePrediction.text?.text || '' }] : []);
    },
    async resolve(placeId) {
      const data = await request(`places/${encodeURIComponent(placeId)}?languageCode=en`, undefined, 'id,formattedAddress,location,addressComponents');
      if (data.id !== placeId || !data.formattedAddress || data.addressComponents?.find(c => c.types?.includes('country'))?.shortText !== 'MY'
        || !Number.isFinite(data.location?.latitude) || !Number.isFinite(data.location?.longitude)) throw new HttpsError('invalid-argument', 'Choose a Malaysian address with a map pin. / 请选择有地图定位的马来西亚地址。');
      return { formattedAddress: data.formattedAddress, latitude: data.location.latitude, longitude: data.location.longitude };
    }
  };
};

export const consumeGroupDeliveryRate = async ({ db, uid, now = new Date() }) => {
  const ref = db.collection('groupDeliveryRateLimits').doc(uid);
  await db.runTransaction(async tx => {
    const prior = (await tx.get(ref)).data();
    const sameWindow = prior && now.getTime() - prior.windowStart < 60000;
    if (sameWindow && prior.count >= 30) throw new HttpsError('resource-exhausted', 'Please wait a minute. / 请稍等一分钟。');
    tx.set(ref, { windowStart: sameWindow ? prior.windowStart : now.getTime(), count: sameWindow ? prior.count + 1 : 1 });
  });
};
