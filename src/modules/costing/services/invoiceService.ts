import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, functions, storage } from '../../../firebase';
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

const getInvoiceStoragePath = (userId: string, invoiceId: string, storageFileName: string) => {
  return `users/${userId}/costing/invoices/${invoiceId}/${storageFileName}`;
};

const uploadInvoiceFile = ({
  userId,
  invoiceId,
  storageFileName,
  file,
  onProgress,
}: {
  userId: string;
  invoiceId: string;
  storageFileName: string;
  file: File;
  onProgress?: (progress: number) => void;
}) => {
  if (!storage) {
    throw new Error('Uploads are temporarily unavailable. Please refresh the page or try again.');
  }

  const invoiceRef = ref(storage, getInvoiceStoragePath(userId, invoiceId, storageFileName));
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

  async listInvoices(userId?: string, options: { includeArchived?: boolean; workspaceId?: string } = {}): Promise<CostingInvoice[]> {
    if (!db || !userId) return [];

    const workspaceId = options.workspaceId || userId;
    const invoicesQuery = query(collection(db, 'invoices'), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(invoicesQuery);

    return snapshot.docs
      .map(invoiceDoc => normalizeInvoice({ id: invoiceDoc.id, ...invoiceDoc.data() } as CostingInvoice))
      .filter(invoice => options.includeArchived || invoice.processingStatus !== 'Archived')
      .sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || ''));
  },

  async uploadInvoice({
    file,
    fileType,
    userId,
    workspaceId = userId,
    onProgress,
  }: {
    file: File;
    fileType: CostingInvoiceFileType;
    userId: string;
    workspaceId?: string;
    onProgress?: (progress: number) => void;
  }): Promise<CostingInvoice> {
    if (!db || !functions) {
      throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    }

    const createUpload = httpsCallable<
      { workspaceId: string; fileName: string; fileType: CostingInvoiceFileType; size: number },
      { invoice: CostingInvoice }
    >(functions, 'createInvoiceUpload');
    const cancelUpload = httpsCallable<{ invoiceId: string }, { cancelled: boolean }>(functions, 'cancelInvoiceUpload');
    const reservation = await createUpload({ workspaceId, fileName: file.name, fileType, size: file.size });
    const invoice = normalizeInvoice(reservation.data.invoice);
    const storageFileName = invoice.storageFileName || file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const invoiceStorageReference = storage
      ? ref(storage, getInvoiceStoragePath(userId, invoice.id, storageFileName))
      : null;

    try {
      const fileUrl = await uploadInvoiceFile({
        userId,
        invoiceId: invoice.id,
        storageFileName,
        file,
        onProgress
      });
      await updateDoc(doc(db, 'invoices', invoice.id), { fileUrl });
      return { ...invoice, fileUrl };
    } catch (err) {
      if (invoiceStorageReference) {
        await deleteObject(invoiceStorageReference).catch(() => undefined);
      }
      await cancelUpload({ invoiceId: invoice.id }).catch(() => undefined);
      throw err;
    }
  },

  async updateInvoice(invoiceId: string, updates: Partial<CostingInvoice>): Promise<void> {
    if (!db) {
      throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
    }

    await updateDoc(doc(db, 'invoices', invoiceId), removeUndefinedFields(updates) as unknown as Record<string, unknown>);
  },

  async archiveInvoice(invoice: CostingInvoice, userId: string): Promise<Partial<CostingInvoice>> {
    const archivedAt = new Date().toISOString();
    const updates: Partial<CostingInvoice> = {
      previousStatus: invoice.processingStatus,
      processingStatus: 'Archived',
      status: 'Archived',
      archivedAt,
      archivedBy: userId
    };

    await this.updateInvoice(invoice.id, updates);
    return updates;
  },

  async restoreInvoice(invoice: CostingInvoice, userId: string): Promise<Partial<CostingInvoice>> {
    const nextStatus = invoice.previousStatus && invoice.previousStatus !== 'Archived'
      ? invoice.previousStatus
      : invoice.approvedAt
        ? 'Imported'
        : 'Pending';
    const updates: Partial<CostingInvoice> = {
      processingStatus: nextStatus,
      status: nextStatus,
      restoredAt: new Date().toISOString(),
      restoredBy: userId
    };

    await this.updateInvoice(invoice.id, updates);
    return updates;
  },

  async deleteInvoice(invoice: CostingInvoice, userId: string): Promise<void> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const deletedAt = new Date().toISOString();
    const auditRef = doc(collection(db, 'invoiceAuditLogs'));
    await setDoc(auditRef, removeUndefinedFields({
      id: auditRef.id,
      invoiceId: invoice.id,
      action: 'Deleted',
      previousStatus: invoice.processingStatus,
      fileName: invoice.fileName,
      supplier: invoice.supplier || invoice.extractedData?.supplier || '',
      deletedBy: userId,
      deletedAt,
      createdBy: userId,
      workspaceId: invoice.workspaceId || userId,
      createdAt: deletedAt
    }));

    if (storage && invoice.fileUrl) {
      await deleteObject(ref(storage, invoice.fileUrl)).catch(error => {
        if (error?.code !== 'storage/object-not-found') throw error;
      });
    }

    await deleteDoc(doc(db, 'invoices', invoice.id));
  }
};
