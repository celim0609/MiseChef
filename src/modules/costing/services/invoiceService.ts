import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../../../firebase';
import type { CostingInvoice, CostingInvoiceFileType } from '../types';

const normalizeInvoice = (invoice: CostingInvoice): CostingInvoice => ({
  ...invoice,
  processingStatus: invoice.processingStatus || invoice.status || 'Pending',
  status: invoice.status || invoice.processingStatus || 'Pending',
  extractedData: invoice.extractedData || null,
  errorMessage: invoice.errorMessage || null
});

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => removeUndefinedFields(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) {
        acc[key] = removeUndefinedFields(item);
      }
      return acc;
    }, {}) as T;
  }

  return value;
};

const getInvoiceStoragePath = (userId: string, invoiceId: string, fileName: string) => {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `users/${userId}/costing/invoices/${invoiceId}/${safeFileName}`;
};

const uploadInvoiceFile = ({
  userId,
  invoiceId,
  file,
  onProgress,
}: {
  userId: string;
  invoiceId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const invoiceRef = ref(storage, getInvoiceStoragePath(userId, invoiceId, file.name));
  const uploadTask = uploadBytesResumable(invoiceRef, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: 'private,max-age=31536000',
  });

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export const invoiceService = {
  async getInvoice(invoiceId?: string): Promise<CostingInvoice | null> {
    if (!db || !invoiceId) return null;

    const snapshot = await getDoc(doc(db, 'invoices', invoiceId));
    if (!snapshot.exists()) return null;

    return normalizeInvoice({ id: snapshot.id, ...snapshot.data() } as CostingInvoice);
  },

  async listInvoices(userId?: string): Promise<CostingInvoice[]> {
    if (!db || !userId) return [];

    const invoicesQuery = query(collection(db, 'invoices'), where('createdBy', '==', userId));
    const snapshot = await getDocs(invoicesQuery);

    return snapshot.docs
      .map(invoiceDoc => normalizeInvoice({ id: invoiceDoc.id, ...invoiceDoc.data() } as CostingInvoice))
      .sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || ''));
  },

  async uploadInvoice({
    file,
    fileType,
    userId,
    onProgress,
  }: {
    file: File;
    fileType: CostingInvoiceFileType;
    userId: string;
    onProgress?: (progress: number) => void;
  }): Promise<CostingInvoice> {
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    const invoiceRef = doc(collection(db, 'invoices'));
    const fileUrl = await uploadInvoiceFile({ userId, invoiceId: invoiceRef.id, file, onProgress });
    const invoice: CostingInvoice = {
      id: invoiceRef.id,
      fileName: file.name,
      fileUrl,
      fileType,
      uploadDate: new Date().toISOString(),
      status: 'Pending',
      processingStatus: 'Pending',
      extractedData: null,
      errorMessage: null,
      createdBy: userId,
      size: file.size
    };

    await setDoc(invoiceRef, removeUndefinedFields(invoice));
    return invoice;
  },

  async updateInvoice(invoiceId: string, updates: Partial<CostingInvoice>): Promise<void> {
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    await updateDoc(doc(db, 'invoices', invoiceId), removeUndefinedFields(updates) as unknown as Record<string, unknown>);
  }
};
