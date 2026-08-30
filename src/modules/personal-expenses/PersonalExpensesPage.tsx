import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronRight,
  FileText,
  Plus,
  ReceiptText,
  Upload,
  UserRound,
  X
} from 'lucide-react';
import type { WorkspaceMemberRole, WorkspaceMemberSummary } from '../../types';
import { useWorkspaceRegion } from '../../regions';
import { deriveMoneyOwed, formatPersonalExpenseCurrency, getTotalMoneyOwed } from './model';
import { PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH } from './merchant';
import { personalExpenseService } from './services/personalExpenseService';
import type { MemberMoneyOwed, PersonalExpense, PersonalExpenseSettlement } from './types';

const EXPENSE_CATEGORIES = ['Food & Ingredients', 'Equipment', 'Transport', 'Utilities', 'Office', 'Repairs & Maintenance', 'Other'];
const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface PersonalExpensesPageProps {
  userId?: string;
  workspaceId: string;
  workspaceRole?: WorkspaceMemberRole | null;
  workspaceMembers: WorkspaceMemberSummary[];
}

interface ExpenseFormState {
  amount: string;
  expenseDate: string;
  description: string;
  category: string;
  merchant: string;
  memberId: string;
}

const Modal = ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-[70] flex items-end justify-center bg-primary/45 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
    <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-surface p-5 shadow-2xl sm:max-w-2xl sm:rounded-[2rem] sm:p-7">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold text-primary">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export default function PersonalExpensesPage({
  userId,
  workspaceId,
  workspaceRole,
  workspaceMembers
}: PersonalExpensesPageProps) {
  const region = useWorkspaceRegion();
  const canManage = workspaceRole === 'Owner' || workspaceRole === 'Manager';
  const activeMembers = useMemo(
    () => workspaceMembers.filter(member => member.status === 'Active'),
    [workspaceMembers]
  );
  const defaultMemberId = useMemo(() => {
    const member = activeMembers.find(item => item.userId === userId) || activeMembers[0];
    return member ? `${workspaceId}_${member.userId}` : '';
  }, [activeMembers, userId, workspaceId]);
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [settlements, setSettlements] = useState<PersonalExpenseSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(canManage);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [addStep, setAddStep] = useState<'choice' | 'form' | null>(null);
  const [entryMode, setEntryMode] = useState<'upload' | 'manual'>('manual');
  const [selectedBalance, setSelectedBalance] = useState<MemberMoneyOwed | null>(null);
  const [settlingBalance, setSettlingBalance] = useState<MemberMoneyOwed | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [isSettling, setIsSettling] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>({
    amount: '', expenseDate: today(), description: '', category: '', merchant: '', memberId: defaultMemberId
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptRecord, setReceiptRecord] = useState<{ receiptPath: string; receiptUrl: string; receiptFileName: string } | null>(null);
  const [draftExpenseId, setDraftExpenseId] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const entrySessionRef = useRef(0);

  const formatMoney = (amount: number) => formatPersonalExpenseCurrency(amount, region.currency);
  const balances = useMemo(() => deriveMoneyOwed(expenses, settlements), [expenses, settlements]);
  const totalOwed = useMemo(() => getTotalMoneyOwed(balances), [balances]);
  const memberName = (memberId: string) => {
    const userIdFromMember = memberId.startsWith(`${workspaceId}_`) ? memberId.slice(workspaceId.length + 1) : memberId;
    return activeMembers.find(member => member.userId === userIdFromMember)?.displayName || 'Workspace member';
  };

  const loadRecords = async () => {
    if (!canManage) return;
    setIsLoading(true);
    setPageError('');
    try {
      const records = await personalExpenseService.listWorkspaceRecords(workspaceId);
      setExpenses(records.expenses);
      setSettlements(records.settlements);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to load Personal Expenses.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadRecords(); }, [workspaceId, canManage]);
  useEffect(() => {
    setForm(current => current.memberId ? current : { ...current, memberId: defaultMemberId });
  }, [defaultMemberId]);

  const resetForm = () => {
    setForm({ amount: '', expenseDate: today(), description: '', category: '', merchant: '', memberId: defaultMemberId });
    setReceiptFile(null);
    setReceiptRecord(null);
    setDraftExpenseId('');
    setFormError('');
    setIsExtracting(false);
    setIsSaving(false);
  };

  const openForm = (mode: 'upload' | 'manual') => {
    resetForm();
    entrySessionRef.current += 1;
    setDraftExpenseId(personalExpenseService.createExpenseId());
    setEntryMode(mode);
    setAddStep('form');
    if (mode === 'upload') setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const cancelEntry = (nextStep: 'choice' | null) => {
    if (isSaving) return;
    const temporaryReceiptPath = receiptRecord?.receiptPath;
    entrySessionRef.current += 1;
    setAddStep(nextStep);
    resetForm();
    if (temporaryReceiptPath) {
      void personalExpenseService.deleteTemporaryReceipt(temporaryReceiptPath).catch(() => undefined);
    }
  };

  const handleReceipt = async (file?: File) => {
    if (!file || !userId || !draftExpenseId) return;
    const entrySession = entrySessionRef.current;
    const previousReceiptPath = receiptRecord?.receiptPath;
    setFormError('');
    setReceiptFile(file);
    try {
      personalExpenseService.validateReceipt(file);
      if (entryMode !== 'upload') return;
      setIsExtracting(true);
      if (previousReceiptPath) {
        await personalExpenseService.deleteTemporaryReceipt(previousReceiptPath).catch(() => undefined);
      }
      const uploaded = await personalExpenseService.uploadReceipt(workspaceId, userId, draftExpenseId, file);
      if (entrySession !== entrySessionRef.current) {
        await personalExpenseService.deleteTemporaryReceipt(uploaded.receiptPath).catch(() => undefined);
        return;
      }
      setReceiptRecord(uploaded);
      const extracted = await personalExpenseService.extractReceipt(workspaceId, {
        receiptPath: uploaded.receiptPath,
        receiptFileName: uploaded.receiptFileName,
        contentType: file.type
      });
      if (entrySession !== entrySessionRef.current) return;
      setForm(current => ({
        ...current,
        amount: extracted.amount > 0 ? extracted.amount.toFixed(2) : current.amount,
        expenseDate: extracted.expenseDate || current.expenseDate,
        merchant: extracted.merchant || current.merchant,
        description: extracted.description || current.description,
        category: EXPENSE_CATEGORIES.includes(extracted.category) ? extracted.category : (extracted.category || current.category)
      }));
    } catch (error) {
      setFormError(`${error instanceof Error ? error.message : 'The receipt could not be read.'} You can still enter the details manually.`);
    } finally {
      setIsExtracting(false);
    }
  };

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    setIsSaving(true);
    setFormError('');
    try {
      let receipt = receiptRecord;
      if (receiptFile && !receipt) {
        receipt = await personalExpenseService.uploadReceipt(workspaceId, userId, draftExpenseId, receiptFile);
        setReceiptRecord(receipt);
      }
      await personalExpenseService.addExpense(draftExpenseId, workspaceId, userId, {
        memberId: form.memberId,
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        description: form.description,
        category: form.category,
        merchant: form.merchant,
        ...receipt
      });
      entrySessionRef.current += 1;
      setAddStep(null);
      resetForm();
      setNotice('Personal expense saved. The company balance owed has been updated.');
      if (canManage) await loadRecords();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save this expense.');
    } finally {
      setIsSaving(false);
    }
  };

  const openSettlement = (balance: MemberMoneyOwed) => {
    setSettlementAmount(balance.outstanding.toFixed(2));
    setSettlingBalance(balance);
    setPageError('');
  };

  const submitSettlement = async (event: FormEvent) => {
    event.preventDefault();
    if (!settlingBalance) return;
    setIsSettling(true);
    setPageError('');
    try {
      await personalExpenseService.settle(workspaceId, settlingBalance.memberId, Number(settlementAmount));
      setSettlingBalance(null);
      setSelectedBalance(null);
      setNotice('Payment recorded. The remaining outstanding balance carries forward automatically.');
      await loadRecords();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to record this payment.');
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Finance</p>
          <h1 className="mt-1 font-display text-4xl font-semibold text-primary">Personal Expenses</h1>
          <p className="mt-2 max-w-2xl font-sans text-sm font-bold text-on-surface-variant">
            Track business costs paid personally by workspace members. Supplier invoices remain in the Invoice workflow.
          </p>
        </div>
        <button type="button" onClick={() => setAddStep('choice')} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary shadow-sm transition active:scale-95">
          <Plus className="h-4 w-4" /> Add Expense
        </button>
      </header>

      {notice && (
        <div className="flex items-center gap-3 rounded-2xl border border-secondary/30 bg-secondary/10 px-4 py-3 font-sans text-sm font-bold text-primary">
          <CheckCircle2 className="h-5 w-5 text-secondary" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}
      {pageError && <div className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">{pageError}</div>}

      {canManage ? (
        <section className="rounded-[2rem] border border-surface-container-high bg-surface p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 border-b border-surface-container-high pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.15em] text-secondary">Money Owed</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-primary">{formatMoney(totalOwed)}</h2>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Total outstanding across workspace members</p>
            </div>
            <Banknote className="h-9 w-9 text-secondary" />
          </div>

          {isLoading ? (
            <p className="py-12 text-center font-sans text-sm font-bold text-on-surface-variant">Loading money owed…</p>
          ) : balances.length === 0 ? (
            <div className="py-12 text-center">
              <ReceiptText className="mx-auto h-10 w-10 text-outline" />
              <h3 className="mt-3 font-display text-xl font-semibold text-primary">No personal expenses yet</h3>
              <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Members with saved expenses will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-container-high">
              {balances.map(balance => (
                <button key={balance.memberId} type="button" onClick={() => setSelectedBalance(balance)} className="flex w-full items-center gap-4 py-5 text-left transition hover:px-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/15 text-secondary"><UserRound className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-sm font-extrabold text-primary">{memberName(balance.memberId)}</span>
                    <span className="font-sans text-xs font-bold text-on-surface-variant">{balance.expenses.length} expense{balance.expenses.length === 1 ? '' : 's'} · {formatMoney(balance.totalSettled)} paid back</span>
                  </span>
                  <span className="font-display text-lg font-semibold text-primary">{formatMoney(balance.outstanding)}</span>
                  <ChevronRight className="h-5 w-5 text-outline" />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-[2rem] border border-surface-container-high bg-surface p-7 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/15 text-secondary"><ReceiptText className="h-6 w-6" /></div>
          <h2 className="mt-5 font-display text-2xl font-semibold text-primary">Record a personal business expense</h2>
          <p className="mt-2 max-w-xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
            Add an expense for any active workspace member. Workspace Owners and Managers can view balances and record repayments.
          </p>
        </section>
      )}

      {addStep === 'choice' && (
        <Modal title="Add Personal Expense" onClose={() => setAddStep(null)}>
          <p className="mb-5 font-sans text-sm font-bold text-on-surface-variant">How would you like to add this expense?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => openForm('upload')} className="rounded-3xl border border-surface-container-high p-5 text-left transition hover:border-secondary hover:bg-secondary/5">
              <Upload className="h-7 w-7 text-secondary" />
              <span className="mt-4 block font-display text-xl font-semibold text-primary">Upload Receipt</span>
              <span className="mt-1 block font-sans text-xs font-bold leading-relaxed text-on-surface-variant">Use AI to fill the details from an image or PDF, then review before saving.</span>
            </button>
            <button type="button" onClick={() => openForm('manual')} className="rounded-3xl border border-surface-container-high p-5 text-left transition hover:border-secondary hover:bg-secondary/5">
              <FileText className="h-7 w-7 text-secondary" />
              <span className="mt-4 block font-display text-xl font-semibold text-primary">Enter Manually</span>
              <span className="mt-1 block font-sans text-xs font-bold leading-relaxed text-on-surface-variant">Enter the expense details. A receipt is optional.</span>
            </button>
          </div>
        </Modal>
      )}

      {addStep === 'form' && (
        <Modal title={entryMode === 'upload' ? 'Review Receipt Details' : 'Enter Personal Expense'} onClose={() => cancelEntry(null)}>
          <form onSubmit={saveExpense} className="space-y-4">
            <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={event => void handleReceipt(event.target.files?.[0])} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-outline/50 bg-surface-container-low p-4 text-left">
              <Upload className="h-5 w-5 text-secondary" />
              <span className="flex-1 font-sans text-sm font-extrabold text-primary">{receiptFile?.name || (entryMode === 'upload' ? 'Choose receipt image or PDF' : 'Add receipt (optional)')}</span>
              {isExtracting && <span className="font-sans text-xs font-bold text-secondary">Reading receipt…</span>}
            </button>
            {formError && <p className="rounded-xl bg-error/10 px-3 py-2 font-sans text-xs font-bold text-error">{formError}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="font-sans text-xs font-extrabold text-primary">Amount
                <input required min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-3 text-sm outline-none focus:border-secondary" placeholder="0.00" />
              </label>
              <label className="font-sans text-xs font-extrabold text-primary">Date
                <input required type="date" value={form.expenseDate} onChange={event => setForm({ ...form, expenseDate: event.target.value })} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-3 text-sm outline-none focus:border-secondary" />
              </label>
            </div>
            <label className="block font-sans text-xs font-extrabold text-primary">Merchant / Supplier <span className="text-outline">(optional)</span>
              <input maxLength={PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH} value={form.merchant} onChange={event => setForm({ ...form, merchant: event.target.value })} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-3 text-sm outline-none focus:border-secondary" placeholder="Where was it purchased?" />
              <span className="mt-1 block font-sans text-[11px] font-bold text-on-surface-variant">One business name, up to {PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH} characters.</span>
            </label>
            <label className="block font-sans text-xs font-extrabold text-primary">What / Description
              <input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-3 text-sm outline-none focus:border-secondary" placeholder="What was purchased?" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="font-sans text-xs font-extrabold text-primary">Category
                <input required list="personal-expense-categories" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-3 text-sm outline-none focus:border-secondary" placeholder="Choose or enter category" />
                <datalist id="personal-expense-categories">{EXPENSE_CATEGORIES.map(category => <option key={category} value={category} />)}</datalist>
              </label>
              <label className="font-sans text-xs font-extrabold text-primary">Paid by
                <select required value={form.memberId} onChange={event => setForm({ ...form, memberId: event.target.value })} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-3 text-sm outline-none focus:border-secondary">
                  <option value="">Select member</option>
                  {activeMembers.map(member => <option key={member.userId} value={`${workspaceId}_${member.userId}`}>{member.displayName}</option>)}
                </select>
              </label>
            </div>
            <div className="flex gap-3 pt-3">
              <button type="button" onClick={() => cancelEntry('choice')} className="rounded-full border border-surface-container-high px-5 py-3 font-sans text-sm font-extrabold text-primary">Back</button>
              <button type="submit" disabled={isSaving || isExtracting || activeMembers.length === 0} className="flex-1 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Expense'}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedBalance && (
        <Modal title={memberName(selectedBalance.memberId)} onClose={() => setSelectedBalance(null)}>
          <button type="button" onClick={() => setSelectedBalance(null)} className="mb-4 inline-flex items-center gap-1 font-sans text-xs font-extrabold text-secondary"><ArrowLeft className="h-4 w-4" /> Money Owed</button>
          <div className="rounded-3xl bg-primary p-5 text-on-primary">
            <p className="font-sans text-xs font-bold uppercase tracking-[0.14em] opacity-75">Total outstanding</p>
            <p className="mt-2 font-display text-3xl font-semibold">{formatMoney(selectedBalance.outstanding)}</p>
            <p className="mt-2 font-sans text-xs font-bold opacity-75">Expenses {formatMoney(selectedBalance.totalExpenses)} · Paid back {formatMoney(selectedBalance.totalSettled)}</p>
            <button type="button" disabled={selectedBalance.outstanding <= 0} onClick={() => openSettlement(selectedBalance)} className="mt-5 rounded-full bg-on-primary px-5 py-2.5 font-sans text-sm font-extrabold text-primary disabled:opacity-50">Settle / Pay Back</button>
          </div>
          <h3 className="mb-3 mt-6 font-display text-xl font-semibold text-primary">Personal expense history</h3>
          <div className="space-y-3">
            {selectedBalance.expenses.map(expense => (
              <article key={expense.id} className="rounded-2xl border border-surface-container-high p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-sm font-extrabold text-primary">{expense.description}</p>
                    <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{expense.expenseDate} · {expense.category}{expense.merchant ? ` · ${expense.merchant}` : ''}</p>
                    {expense.receiptUrl && <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-sans text-xs font-extrabold text-secondary"><ReceiptText className="h-3.5 w-3.5" /> View receipt</a>}
                  </div>
                  <p className="font-display text-lg font-semibold text-primary">{formatMoney(expense.amount)}</p>
                </div>
              </article>
            ))}
          </div>
          {selectedBalance.settlements.length > 0 && (
            <>
              <h3 className="mb-3 mt-6 font-display text-xl font-semibold text-primary">Payments recorded</h3>
              <div className="space-y-2">{selectedBalance.settlements.map(item => <div key={item.id} className="flex justify-between rounded-2xl bg-secondary/10 px-4 py-3 font-sans text-xs font-extrabold text-primary"><span>{item.settledAt.slice(0, 10)}</span><span>− {formatMoney(item.amount)}</span></div>)}</div>
            </>
          )}
        </Modal>
      )}

      {settlingBalance && (
        <Modal title="Settle / Pay Back" onClose={() => setSettlingBalance(null)}>
          <p className="font-sans text-sm font-bold text-on-surface-variant">Company owes {memberName(settlingBalance.memberId)} <strong className="text-primary">{formatMoney(settlingBalance.outstanding)}</strong>.</p>
          <form onSubmit={submitSettlement} className="mt-5 space-y-4">
            <label className="block font-sans text-xs font-extrabold text-primary">Payment amount
              <input required autoFocus min="0.01" max={settlingBalance.outstanding.toFixed(2)} step="0.01" inputMode="decimal" value={settlementAmount} onChange={event => setSettlementAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-3 text-sm outline-none focus:border-secondary" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSettlementAmount(settlingBalance.outstanding.toFixed(2))} className="rounded-full border border-secondary px-4 py-2 font-sans text-xs font-extrabold text-secondary">Full payment</button>
              <p className="self-center font-sans text-xs font-bold text-on-surface-variant">Partial payments leave the remainder outstanding.</p>
            </div>
            <button type="submit" disabled={isSettling} className="w-full rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50">{isSettling ? 'Recording…' : 'Record Payment'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
