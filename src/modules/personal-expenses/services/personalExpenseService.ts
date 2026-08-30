import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, functions, storage } from '../../../firebase';
import type {
  PersonalExpense,
  PersonalExpenseDraft,
  PersonalExpenseReceiptExtraction,
  PersonalExpenseSettlement
} from '../types';
import { sanitizeExtractedMerchant, validateMerchantForSave } from '../merchant';

const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const readString = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const readNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'receipt';
const normalizeExpense = (id: string, value: Record<string, unknown>): PersonalExpense => ({
  id,
  workspaceId: readString(value.workspaceId),
  memberId: readString(value.memberId),
  amount: readNumber(value.amount),
  expenseDate: readString(value.expenseDate),
  description: readString(value.description),
  category: readString(value.category),
  merchant: readString(value.merchant) || undefined,
  receiptUrl: readString(value.receiptUrl) || undefined,
  receiptPath: readString(value.receiptPath) || undefined,
  receiptFileName: readString(value.receiptFileName) || undefined,
  createdBy: readString(value.createdBy),
  createdAt: readString(value.createdAt)
});
const normalizeSettlement = (id: string, value: Record<string, unknown>): PersonalExpenseSettlement => ({
  id,
  workspaceId: readString(value.workspaceId),
  memberId: readString(value.memberId),
  amount: readNumber(value.amount),
  settledAt: readString(value.settledAt),
  createdBy: readString(value.createdBy),
  createdAt: readString(value.createdAt)
});

export const personalExpenseService = {
  createExpenseId() {
    if (!db) throw new Error('Personal Expenses are temporarily unavailable.');
    return doc(collection(db, 'personalExpenses')).id;
  },

  validateReceipt(file: File) {
    if (!RECEIPT_TYPES.has(file.type)) throw new Error('Choose a PDF, JPG, PNG, or WEBP receipt.');
    if (!file.size || file.size > MAX_RECEIPT_BYTES) throw new Error('Receipt files must be 10 MB or smaller.');
  },

  async uploadReceipt(workspaceId: string, userId: string, expenseId: string, file: File) {
    if (!storage) throw new Error('Receipt storage is temporarily unavailable.');
    this.validateReceipt(file);
    if (!expenseId) throw new Error('Personal Expense ID is required before uploading a receipt.');
    const receiptPath = `personal-expenses/${workspaceId}/${userId}/${expenseId}/${Date.now()}_${safeFileName(file.name)}`;
    const receiptRef = ref(storage, receiptPath);
    await uploadBytes(receiptRef, file, { contentType: file.type });
    return { receiptPath, receiptUrl: await getDownloadURL(receiptRef), receiptFileName: file.name };
  },

  async deleteTemporaryReceipt(receiptPath?: string) {
    if (!storage || !receiptPath) return;
    await deleteObject(ref(storage, receiptPath));
  },

  async extractReceipt(workspaceId: string, receipt: { receiptPath: string; receiptFileName: string; contentType: string }) {
    if (!functions) throw new Error('AI receipt extraction is temporarily unavailable.');
    const extract = httpsCallable<typeof receipt & { workspaceId: string }, { expense: PersonalExpenseReceiptExtraction }>(
      functions,
      'extractPersonalExpenseReceipt'
    );
    const result = await extract({ workspaceId, ...receipt });
    const value = result.data?.expense || {} as PersonalExpenseReceiptExtraction;
    return {
      amount: readNumber(value.amount),
      expenseDate: readString(value.expenseDate),
      merchant: sanitizeExtractedMerchant(value.merchant),
      description: readString(value.description),
      category: readString(value.category)
    };
  },

  async addExpense(expenseId: string, workspaceId: string, userId: string, draft: PersonalExpenseDraft) {
    if (!db) throw new Error('Personal Expenses are temporarily unavailable.');
    if (!expenseId) throw new Error('Personal Expense ID is required.');
    const amount = Math.round(Number(draft.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.');
    if (!draft.memberId || !draft.expenseDate || !draft.description.trim() || !draft.category.trim()) {
      throw new Error('Amount, date, description, category, and paid by are required.');
    }
    const createdAt = new Date().toISOString();
    const merchant = validateMerchantForSave(draft.merchant);
    const payload = Object.fromEntries(Object.entries({
      workspaceId,
      memberId: draft.memberId,
      amount,
      expenseDate: draft.expenseDate,
      description: draft.description.trim(),
      category: draft.category.trim(),
      merchant: merchant || undefined,
      receiptUrl: draft.receiptUrl,
      receiptPath: draft.receiptPath,
      receiptFileName: draft.receiptFileName,
      createdBy: userId,
      createdAt
    }).filter(([, value]) => value !== undefined));
    await setDoc(doc(db, 'personalExpenses', expenseId), payload);
    return normalizeExpense(expenseId, payload);
  },

  async listWorkspaceRecords(workspaceId: string) {
    if (!db || !workspaceId) return { expenses: [], settlements: [] };
    const [expenseSnapshot, settlementSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'personalExpenses'), where('workspaceId', '==', workspaceId))),
      getDocs(query(collection(db, 'personalExpenseSettlements'), where('workspaceId', '==', workspaceId)))
    ]);
    return {
      expenses: expenseSnapshot.docs.map(item => normalizeExpense(item.id, item.data() as Record<string, unknown>)),
      settlements: settlementSnapshot.docs.map(item => normalizeSettlement(item.id, item.data() as Record<string, unknown>))
    };
  },

  async settle(workspaceId: string, memberId: string, amount: number) {
    if (!functions) throw new Error('Settlements are temporarily unavailable.');
    const recordSettlement = httpsCallable<
      { workspaceId: string; memberId: string; amount: number },
      { settlement: PersonalExpenseSettlement; outstanding: number }
    >(functions, 'recordPersonalExpenseSettlement');
    const result = await recordSettlement({ workspaceId, memberId, amount });
    return result.data;
  }
};
