import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type {
  ApprovedProduct,
  CreatorAffiliateProductLink,
  CreatorAffiliateProfile
} from '../../../types';
import { normalizeApprovedAffiliateUrl } from './approvedProductValidation';
import { normalizeCreatorCode, requireCreatorLinkVerification } from './creatorAffiliateValidation';

export { normalizeCreatorCode } from './creatorAffiliateValidation';

export interface CreatorAffiliateProfileWithLinks extends CreatorAffiliateProfile {
  links: CreatorAffiliateProductLink[];
}

const mapProfile = (
  creatorCode: string,
  value: Record<string, unknown>,
  links: CreatorAffiliateProductLink[]
): CreatorAffiliateProfileWithLinks => ({
  creatorCode,
  userId: String(value.userId || ''),
  active: value.active === true,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  createdBy: String(value.createdBy || ''),
  updatedBy: String(value.updatedBy || ''),
  links
});

const mapLink = (value: Record<string, unknown>): CreatorAffiliateProductLink => ({
  creatorCode: String(value.creatorCode || ''),
  productId: String(value.productId || ''),
  affiliateUrl: String(value.affiliateUrl || ''),
  merchantHostname: 's.shopee.sg',
  active: value.active === true,
  verifiedAt: value.verifiedAt,
  verifiedBy: typeof value.verifiedBy === 'string' ? value.verifiedBy : undefined,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  createdBy: String(value.createdBy || ''),
  updatedBy: String(value.updatedBy || '')
});

const requireFirestore = () => {
  if (!db) throw new Error('Creator affiliate management is temporarily unavailable.');
  return db;
};

export const creatorAffiliateAdminService = {
  async listProfiles(): Promise<CreatorAffiliateProfileWithLinks[]> {
    const firestore = requireFirestore();
    const profiles = await getDocs(collection(firestore, 'creatorAffiliateProfiles'));
    return Promise.all(profiles.docs.map(async profile => {
      const links = await getDocs(collection(firestore, 'creatorAffiliateProfiles', profile.id, 'productLinks'));
      return mapProfile(
        profile.id,
        profile.data(),
        links.docs.map(link => mapLink(link.data())).sort((a, b) => a.productId.localeCompare(b.productId))
      );
    })).then(items => items.sort((a, b) => a.creatorCode.localeCompare(b.creatorCode)));
  },

  async createProfile({
    creatorCode,
    userId,
    active,
    adminUserId
  }: {
    creatorCode: string;
    userId: string;
    active: boolean;
    adminUserId: string;
  }) {
    const firestore = requireFirestore();
    const code = normalizeCreatorCode(creatorCode);
    if (!code) throw new Error('Creator code must use the format MC followed by 3–6 digits.');
    if (!userId.trim()) throw new Error('Select a chef account.');
    const existingCode = await getDoc(doc(firestore, 'creatorAffiliateProfiles', code));
    if (existingCode.exists()) throw new Error(`${code} is already assigned.`);
    const existingUser = await getDocs(query(
      collection(firestore, 'creatorAffiliateProfiles'),
      where('userId', '==', userId.trim())
    ));
    if (!existingUser.empty) throw new Error('This chef already has a creator code.');

    await setDoc(doc(firestore, 'creatorAffiliateProfiles', code), {
      creatorCode: code,
      userId: userId.trim(),
      active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: adminUserId,
      updatedBy: adminUserId
    });
  },

  async setProfileActive(creatorCode: string, active: boolean, adminUserId: string) {
    const firestore = requireFirestore();
    await updateDoc(doc(firestore, 'creatorAffiliateProfiles', normalizeCreatorCode(creatorCode)), {
      active,
      updatedAt: serverTimestamp(),
      updatedBy: adminUserId
    });
  },

  async saveUnverifiedProductLink({
    creatorCode,
    product,
    affiliateUrl,
    adminUserId
  }: {
    creatorCode: string;
    product: ApprovedProduct;
    affiliateUrl: string;
    adminUserId: string;
  }) {
    const firestore = requireFirestore();
    const code = normalizeCreatorCode(creatorCode);
    const url = normalizeApprovedAffiliateUrl(affiliateUrl);
    if (!code) throw new Error('Select a valid creator.');
    if (!product.id) throw new Error('Select an approved product.');
    if (!url) throw new Error('Creator link must use https://s.shopee.sg.');
    const linkReference = doc(firestore, 'creatorAffiliateProfiles', code, 'productLinks', product.id);
    const existing = await getDoc(linkReference);
    if (existing.exists()) {
      await updateDoc(linkReference, {
        affiliateUrl: url,
        merchantHostname: 's.shopee.sg',
        active: false,
        verifiedAt: deleteField(),
        verifiedBy: deleteField(),
        updatedAt: serverTimestamp(),
        updatedBy: adminUserId
      });
      return;
    }
    await setDoc(linkReference, {
      creatorCode: code,
      productId: product.id,
      affiliateUrl: url,
      merchantHostname: 's.shopee.sg',
      active: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: adminUserId,
      updatedBy: adminUserId
    });
  },

  async verifyAndActivateProductLink({
    creatorCode,
    productId,
    adminUserId,
    subIdConfirmed,
    clickReportConfirmed
  }: {
    creatorCode: string;
    productId: string;
    adminUserId: string;
    subIdConfirmed: boolean;
    clickReportConfirmed: boolean;
  }) {
    requireCreatorLinkVerification(subIdConfirmed, clickReportConfirmed);
    const firestore = requireFirestore();
    await updateDoc(doc(
      firestore,
      'creatorAffiliateProfiles',
      normalizeCreatorCode(creatorCode),
      'productLinks',
      productId
    ), {
      active: true,
      verifiedAt: serverTimestamp(),
      verifiedBy: adminUserId,
      updatedAt: serverTimestamp(),
      updatedBy: adminUserId
    });
  },

  async deactivateProductLink(creatorCode: string, productId: string, adminUserId: string) {
    const firestore = requireFirestore();
    await updateDoc(doc(
      firestore,
      'creatorAffiliateProfiles',
      normalizeCreatorCode(creatorCode),
      'productLinks',
      productId
    ), {
      active: false,
      updatedAt: serverTimestamp(),
      updatedBy: adminUserId
    });
  },

  async assignRecipeCreator({
    recipeId,
    creatorCode
  }: {
    recipeId: string;
    creatorCode: string;
  }) {
    const firestore = requireFirestore();
    const code = normalizeCreatorCode(creatorCode);
    if (!recipeId.trim()) throw new Error('Enter a recipe ID.');
    if (!code) throw new Error('Select a valid creator.');
    await updateDoc(doc(firestore, 'recipes', recipeId.trim()), {
      affiliateCreatorCode: code,
      updatedAt: new Date().toISOString()
    });
  }
};
