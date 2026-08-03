import type { PublicStoreData } from '../types';

export const createPublicStoreQaFixture = (slug: string): PublicStoreData | null => {
  if (slug !== 'ce-lim-kitchen-qa') return null;
  const now = '2026-07-26T00:00:00.000Z';
  return {
    store: {
      id: 'qa-ce-lim-workspace',
      workspaceId: 'qa-ce-lim-workspace',
      slug,
      name: 'Ce Lim Kitchen',
      logoUrl: '',
      coverImageUrl: '',
      description: 'Local checkout layout fixture. No production data or payment credentials are used.',
      contactInformation: '',
      businessWhatsApp: '+60123456789',
      storeContact: {
        phone: '+60123456789',
        email: 'hello@example.com',
        whatsapp: '+60123456789',
        facebook: '',
        instagram: '',
        tiktok: '',
        website: 'https://example.com'
      },
      businessHours: 'Monday–Friday, 8:00 AM–2:00 PM',
      pickupEnabled: true,
      deliveryEnabled: false,
      pickupSessions: ['Breakfast', 'Lunch'],
      pickupLocations: [{
        id: 'qa-counter',
        name: 'Main Counter',
        address: 'Public pickup address',
        notes: 'Show your order number'
      }],
      orderDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      earliestPickupDays: 1,
      maximumAdvanceDays: 14,
      unavailableDates: [],
      paymentMethods: [
        { id: 'cash_on_pickup', enabled: true, qrCodeUrl: '', instructions: 'Pay when you collect.' },
        { id: 'touch_n_go_qr', enabled: false, qrCodeUrl: '', instructions: '' },
        { id: 'duitnow_qr', enabled: false, qrCodeUrl: '', instructions: '' },
        { id: 'bank_transfer', enabled: false, qrCodeUrl: '', instructions: '' },
        { id: 'stripe', enabled: true, qrCodeUrl: '', instructions: '' }
      ],
      country: 'MY',
      currency: 'MYR',
      createdBy: 'qa-owner',
      createdAt: now,
      updatedAt: now
    },
    products: [{
      id: 'qa-breakfast',
      storeId: 'qa-ce-lim-workspace',
      workspaceId: 'qa-ce-lim-workspace',
      photoUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22640%22 height=%22400%22 viewBox=%220 0 640 400%22%3E%3Crect width=%22640%22 height=%22400%22 fill=%22%23e8ede7%22/%3E%3Ctext x=%22320%22 y=%22210%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2232%22 fill=%22%233e5641%22%3ELocal QA Product%3C/text%3E%3C/svg%3E',
      name: 'Grab & Go Set',
      description: 'Fixture product used only to verify the local payment layout.',
      price: 5.9,
      available: true,
      optionGroupIds: ['qa-size', 'qa-addons'],
      createdBy: 'qa-owner',
      createdAt: now,
      updatedAt: now
    }],
    optionGroups: [{
      id: 'qa-size',
      storeId: 'qa-ce-lim-workspace',
      workspaceId: 'qa-ce-lim-workspace',
      name: 'Size',
      selectionType: 'single',
      required: true,
      minimumSelections: 1,
      maximumSelections: 1,
      sortOrder: 0,
      available: true,
      options: [
        { id: 'regular', name: 'Regular', priceAdjustment: 0, available: true, sortOrder: 0 },
        { id: 'large', name: 'Large', priceAdjustment: 2, available: true, sortOrder: 1 }
      ],
      createdBy: 'qa-owner',
      createdAt: now,
      updatedAt: now
    }, {
      id: 'qa-addons',
      storeId: 'qa-ce-lim-workspace',
      workspaceId: 'qa-ce-lim-workspace',
      name: 'Add-ons',
      selectionType: 'multiple',
      required: true,
      minimumSelections: 1,
      maximumSelections: 2,
      sortOrder: 1,
      available: true,
      options: [
        { id: 'egg', name: 'Egg', priceAdjustment: 1.5, available: true, sortOrder: 0 },
        { id: 'cheese', name: 'Cheese', priceAdjustment: 2, available: true, sortOrder: 1 },
        { id: 'sauce', name: 'Sauce', priceAdjustment: 0.5, available: true, sortOrder: 2 },
        { id: 'chicken', name: 'Chicken', priceAdjustment: 4, available: false, sortOrder: 3 }
      ],
      createdBy: 'qa-owner',
      createdAt: now,
      updatedAt: now
    }]
  };
};
