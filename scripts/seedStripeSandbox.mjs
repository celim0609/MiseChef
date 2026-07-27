const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-misechef-preview';
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const baseUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`;

const encodeValue = value => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nestedValue]) => [key, encodeValue(nestedValue)])
        )
      }
    };
  }
  throw new TypeError(`Unsupported Firestore value: ${typeof value}`);
};

const writeDocument = async (collection, documentId, data) => {
  const response = await fetch(`${baseUrl}/${collection}/${documentId}`, {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer owner',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, encodeValue(value)])
      )
    })
  });
  if (!response.ok) {
    throw new Error(`Could not seed ${collection}/${documentId}: ${await response.text()}`);
  }
};

const workspaceId = 'qa-ce-lim-workspace';
const now = new Date().toISOString();

await writeDocument('stores', workspaceId, {
  id: workspaceId,
  workspaceId,
  slug: 'qa-ce-lim-kitchen',
  name: 'Ce Lim Kitchen — Sandbox',
  logoUrl: '',
  coverImageUrl: '',
  description: 'Stripe sandbox checkout. No real order or payment will be created.',
  contactInformation: '',
  businessWhatsApp: '',
  businessHours: 'Sandbox testing only',
  pickupEnabled: true,
  deliveryEnabled: false,
  pickupSessions: ['Lunch'],
  pickupLocations: [{
    id: 'sandbox-counter',
    name: 'Sandbox Counter',
    address: 'Test pickup location — not a real address',
    notes: ''
  }],
  orderDays: [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  ],
  earliestPickupDays: 0,
  maximumAdvanceDays: 14,
  unavailableDates: [],
  country: 'MY',
  currency: 'MYR',
  createdBy: 'sandbox',
  createdAt: now,
  updatedAt: now
});

await writeDocument('storeProducts', 'qa-grab-and-go', {
  id: 'qa-grab-and-go',
  storeId: workspaceId,
  workspaceId,
  photoUrl: '',
  name: 'Sandbox Grab & Go',
  description: 'Test product for Stripe sandbox QA.',
  price: 5.9,
  available: true,
  optionGroupIds: [],
  createdBy: 'sandbox',
  createdAt: now,
  updatedAt: now
});

console.log('Seeded isolated Stripe sandbox store at /store/qa-ce-lim-kitchen.');
