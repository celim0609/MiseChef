import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import type { CustomerContact } from '../types';

const readString = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export const normalizeCustomerContact = (value: unknown): CustomerContact => {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    name: readString(data.name),
    phone: readString(data.phone),
    email: readString(data.email)
  };
};

const requireCurrentCustomer = (userId: string) => {
  if (!db || !auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sign in to reuse checkout details.');
  }
  return db;
};

export const customerContactService = {
  async load(userId: string): Promise<CustomerContact> {
    const firestore = requireCurrentCustomer(userId);
    const snapshot = await getDoc(doc(firestore, 'users', userId));
    if (!snapshot.exists()) return { name: '', phone: '', email: '' };
    const data = snapshot.data();
    const contact = normalizeCustomerContact(data.customerContact);
    return {
      name: contact.name || readString(data.displayName),
      phone: contact.phone,
      email: contact.email || readString(data.email)
    };
  },

  async save(userId: string, contact: CustomerContact): Promise<void> {
    const firestore = requireCurrentCustomer(userId);
    await setDoc(doc(firestore, 'users', userId), {
      customerContact: {
        ...normalizeCustomerContact(contact),
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });
  }
};
