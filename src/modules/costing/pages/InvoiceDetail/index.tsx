import { useEffect, useState, type ChangeEvent } from 'react';
import { Archive, ArrowLeft, CheckCircle2, Download, FileJson, FileSpreadsheet, Loader2, RotateCcw, RotateCw, Sparkles, Trash2, XCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { ingredientService, invoiceImportService, invoiceLifecycleService, invoiceProcessor, invoiceService, matchInvoiceItemsToIngredients } from '../../services';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import type { InvoiceImportMatch } from '../../services';
import type { CostingIngredient, CostingInvoice, CostingInvoiceExtractedItem, CostingInvoiceStatus } from '../../types';

interface InvoiceDetailPageProps {
  invoiceId?: string | null;
  userId?: string;
  workspaceId?: string;
  canManageInvoices?: boolean;
  onBack: () => void;
}

const statusClassName: Record<CostingInvoiceStatus, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Processing: 'bg-blue-100 text-blue-800',
  Processed: 'bg-green-100 text-green-800',
  Imported: 'bg-primary/10 text-primary',
  Failed: 'bg-red-100 text-red-800',
  Archived: 'bg-surface-container-high text-on-surface-variant'
};

const formatDate = (value?: string) => value ? new Date(value).toLocaleString() : 'Not set';
const formatMoney = (value?: number, currency?: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${currency ? `${currency} ` : ''}${value.toFixed(2)}`;
};
const formatProcessingTime = (startedAt?: string, completedAt?: string) => {
  if (!startedAt || !completedAt) return 'Not available';

  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return 'Not available';
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} sec`;
};

const isImageInvoice = (invoice: CostingInvoice) => invoice.fileType === 'Image' || /\.(jpg|jpeg|png|webp)$/i.test(invoice.fileName);
const isPdfInvoice = (invoice: CostingInvoice) => invoice.fileType === 'PDF' || /\.pdf$/i.test(invoice.fileName);

type OcrConfidence = 'High' | 'Medium' | 'Low';

const confidenceClassName: Record<OcrConfidence, string> = {
  High: 'bg-green-100 text-green-800 border-green-200',
  Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Low: 'bg-red-100 text-red-800 border-red-200'
};

const getOcrConfidence = (invoice: CostingInvoice, itemCount: number): OcrConfidence => {
  if (invoice.processingStatus === 'Failed' || invoice.errorMessage) return 'Low';
  if (invoice.processingStatus === 'Processing') return 'Medium';

  const hasCoreFields = Boolean(invoice.supplier || invoice.extractedData?.supplier)
    && Boolean(invoice.invoiceNumber || invoice.extractedData?.invoiceNumber)
    && Boolean(invoice.invoiceDate || invoice.extractedData?.invoiceDate)
    && typeof (invoice.total ?? invoice.extractedData?.total) === 'number';

  if (hasCoreFields && itemCount >= 3) return 'High';
  if (itemCount > 0 || hasCoreFields) return 'Medium';
  return 'Low';
};

const notifyInvoiceLifecycleChanged = () => {
  window.dispatchEvent(new CustomEvent('misechef:invoice-lifecycle-changed'));
};

export default function InvoiceDetailPage({ invoiceId, userId, workspaceId, canManageInvoices = false, onBack }: InvoiceDetailPageProps) {
  const [invoice, setInvoice] = useState<CostingInvoice | null>(null);
  const [ingredients, setIngredients] = useState<CostingIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [zoom, setZoom] = useState(1);
  const [processingAction, setProcessingAction] = useState<'process' | 'reprocess' | null>(null);
  const [reviewItems, setReviewItems] = useState<CostingInvoiceExtractedItem[]>([]);
  const [ingredientMatches, setIngredientMatches] = useState<InvoiceImportMatch[]>([]);
  const [reviewMessage, setReviewMessage] = useState('');
  const [lifecycleAction, setLifecycleAction] = useState<'archive' | 'restore' | 'delete' | 'rollback' | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadInvoice = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const [loadedInvoice, loadedIngredients] = await Promise.all([
          invoiceService.getInvoice(invoiceId || undefined),
          ingredientService.listIngredients(workspaceId || userId)
        ]);
        if (!isCancelled) {
          setInvoice(loadedInvoice);
          const items = loadedInvoice?.extractedData?.items || [];
          setIngredients(loadedIngredients);
          setReviewItems(items);
          setIngredientMatches(matchInvoiceItemsToIngredients(items, loadedIngredients));
        }
      } catch (err) {
        if (!isCancelled) setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to load invoice.'));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadInvoice();

    return () => {
      isCancelled = true;
    };
  }, [invoiceId, userId, workspaceId]);

  const processInvoice = async (action: 'process' | 'reprocess') => {
    if (!invoice || processingAction) return;

    const processingStartedAt = new Date().toISOString();
    setProcessingAction(action);
    setErrorMessage('');
    setReviewMessage('');
    setInvoice(current => current ? {
      ...current,
      processingStatus: 'Processing',
      status: 'Processing',
      processingStartedAt,
      errorMessage: null
    } : current);

    try {
      await invoiceService.updateInvoice(invoice.id, {
        processingStatus: 'Processing',
        status: 'Processing',
        processingStartedAt,
        errorMessage: null
      });

      const result = await invoiceProcessor.processInvoice({
        ...invoice,
        processingStatus: 'Processing',
        status: 'Processing',
        processingStartedAt,
        errorMessage: null
      });
      const extractedData = result.extractedData;
      const processingCompletedAt = new Date().toISOString();
      const processedUpdates: Partial<CostingInvoice> = {
        processingStatus: 'Processed',
        status: 'Processed',
        processingCompletedAt,
        extractedData,
        supplier: extractedData?.supplier || invoice.supplier,
        invoiceNumber: extractedData?.invoiceNumber || invoice.invoiceNumber,
        invoiceDate: extractedData?.invoiceDate || invoice.invoiceDate,
        currency: extractedData?.currency || invoice.currency,
        subtotal: extractedData?.subtotal ?? invoice.subtotal,
        gst: extractedData?.gst ?? invoice.gst,
        total: extractedData?.total ?? invoice.total,
        errorMessage: null
      };

      await invoiceService.updateInvoice(invoice.id, processedUpdates);
      setInvoice(current => current ? { ...current, ...processedUpdates } : current);
      setReviewItems(extractedData?.items || []);
      setIngredientMatches(matchInvoiceItemsToIngredients(extractedData?.items || [], ingredients));
      setReviewMessage('OCR complete. Review the extracted items before approving import.');
    } catch (err) {
      const processingCompletedAt = new Date().toISOString();
      const errorText = getCustomerFriendlyErrorMessage(err, 'Unable to process invoice.');
      const failedUpdates: Partial<CostingInvoice> = {
        processingStatus: 'Failed',
        status: 'Failed',
        processingCompletedAt,
        errorMessage: errorText
      };

      await invoiceService.updateInvoice(invoice.id, failedUpdates).catch(() => undefined);
      setInvoice(current => current ? { ...current, ...failedUpdates } : current);
      setErrorMessage(errorText);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleReviewItemChange = (
    index: number,
    field: keyof CostingInvoiceExtractedItem,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setReviewItems(current => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return {
        ...item,
        [field]: field === 'name' || field === 'unit' ? value : Number(value) || 0
      };
    }));
  };

  const handleMatchedIngredientChange = (index: number, ingredientId: string) => {
    setIngredientMatches(current => current.map((match, matchIndex) => {
      if (matchIndex !== index) return match;
      return {
        ...match,
        matchedIngredientId: ingredientId || undefined,
        status: ingredientId ? 'Matched' : 'New Ingredient'
      };
    }));
  };

  const handleApproveImport = async () => {
    if (!invoice || !userId || isImporting) return;

    setIsImporting(true);
    setErrorMessage('');
    setReviewMessage('');

    try {
      const matches = ingredientMatches.map((match, index) => ({
        ...match,
        item: reviewItems[index] || match.item,
        status: match.matchedIngredientId ? 'Matched' as const : 'New Ingredient' as const
      }));
      const result = await invoiceImportService.approveImport({
        invoice,
        matches,
        ingredients,
        userId,
        workspaceId: workspaceId || userId
      });
      const loadedIngredients = await ingredientService.listIngredients(workspaceId || userId);
      setIngredients(loadedIngredients);
      setInvoice(current => current ? { ...current, ...result.invoiceUpdates } : current);
      notifyInvoiceLifecycleChanged();
      setReviewMessage('Import approved. Ingredients and price history were updated.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to approve import.'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleRollbackImport = async () => {
    if (!invoice || !userId || !canManageInvoices || lifecycleAction) return;

    setLifecycleAction('rollback');
    setErrorMessage('');
    setReviewMessage('');

    try {
      const impact = await invoiceLifecycleService.getImportImpact(invoice.id);
      const confirmed = window.confirm([
        'Rollback this imported invoice?',
        '',
        `Affected price history records: ${impact.historyCount}`,
        `Ingredient prices to restore: ${impact.updatedIngredientCount}`,
        `New ingredients eligible for deletion: ${impact.newIngredientCount}`,
        '',
        'Affected recipes will be queued for recalculation and dashboard totals will refresh.'
      ].join('\n'));
      if (!confirmed) return;

      const result = await invoiceLifecycleService.rollbackImport({ invoice, userId, workspaceId: workspaceId || userId });
      const loadedIngredients = await ingredientService.listIngredients(workspaceId || userId);
      setIngredients(loadedIngredients);
      setInvoice(current => current ? { ...current, ...result.invoiceUpdates } : current);
      notifyInvoiceLifecycleChanged();
      setReviewMessage(`Import rolled back. ${result.restoredIngredients} ingredients restored, ${result.deletedIngredients} new ingredients deleted.`);
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to roll back invoice import.'));
    } finally {
      setLifecycleAction(null);
    }
  };

  const handleArchiveInvoice = async () => {
    if (!invoice || !userId || !canManageInvoices || lifecycleAction) return;

    setLifecycleAction('archive');
    setErrorMessage('');
    setReviewMessage('');

    try {
      const updates = await invoiceService.archiveInvoice(invoice, userId);
      setInvoice(current => current ? { ...current, ...updates } : current);
      notifyInvoiceLifecycleChanged();
      setReviewMessage('Invoice archived. It is hidden from the default invoice history.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to archive invoice.'));
    } finally {
      setLifecycleAction(null);
    }
  };

  const handleRestoreInvoice = async () => {
    if (!invoice || !userId || !canManageInvoices || lifecycleAction) return;

    setLifecycleAction('restore');
    setErrorMessage('');
    setReviewMessage('');

    try {
      const updates = await invoiceService.restoreInvoice(invoice, userId);
      setInvoice(current => current ? { ...current, ...updates } : current);
      notifyInvoiceLifecycleChanged();
      setReviewMessage('Invoice restored.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to restore invoice.'));
    } finally {
      setLifecycleAction(null);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoice || !userId || !canManageInvoices || lifecycleAction) return;

    const isImportedInvoice = invoice.processingStatus === 'Imported' || Boolean(invoice.approvedAt);
    setLifecycleAction('delete');
    setErrorMessage('');
    setReviewMessage('');

    try {
      let confirmed = false;
      if (isImportedInvoice) {
        const impact = await invoiceLifecycleService.getImportImpact(invoice.id);
        confirmed = window.confirm([
          'This invoice has already updated ingredients and price history.',
          '',
          'Deleting it will rollback all imported changes.',
          '',
          `Affected price history records: ${impact.historyCount}`,
          `Ingredient prices to restore: ${impact.updatedIngredientCount}`,
          `New ingredients eligible for deletion: ${impact.newIngredientCount}`,
          '',
          'Choose OK for Rollback & Delete, or Cancel.'
        ].join('\n'));
      } else {
        confirmed = window.confirm('Delete this invoice?\n\nThis will remove the invoice, uploaded file, extracted details, and history entry.');
      }

      if (!confirmed) return;

      if (isImportedInvoice) {
        await invoiceLifecycleService.rollbackImport({ invoice, userId, workspaceId: workspaceId || userId });
      }
      await invoiceService.deleteInvoice(invoice, userId);
      notifyInvoiceLifecycleChanged();
      onBack();
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to delete invoice.'));
    } finally {
      setLifecycleAction(null);
    }
  };

  if (isLoading) {
    return <p className="font-sans text-sm font-bold text-on-surface-variant">Loading invoice...</p>;
  }

  if (!invoice) {
    return (
      <section className="rounded-2xl border border-surface-container-high bg-surface-container-low p-6 sm:p-8 shadow-sm">
        <p className="font-sans text-sm font-bold text-error">{errorMessage || 'Invoice not found.'}</p>
        <button type="button" onClick={onBack} className="mt-5 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">Back</button>
      </section>
    );
  }

  const extractedItems = reviewItems;
  const isProcessing = processingAction !== null || invoice.processingStatus === 'Processing';
  const currency = invoice.currency ?? invoice.extractedData?.currency;
  const subtotal = invoice.subtotal ?? invoice.extractedData?.subtotal;
  const gst = invoice.gst ?? invoice.extractedData?.gst;
  const totalAmount = invoice.total ?? invoice.extractedData?.total;
  const confidence = getOcrConfidence(invoice, extractedItems.length);
  const hasOcrData = Boolean(invoice.extractedData);
  const rawOcrJson = invoice.extractedData ? JSON.stringify(invoice.extractedData, null, 2) : '';
  const isImported = invoice.processingStatus === 'Imported' || Boolean(invoice.approvedAt);
  const isArchived = invoice.processingStatus === 'Archived';
  const isLifecycleBusy = lifecycleAction !== null;

  return (
    <div className="space-y-6">
      {(invoice.errorMessage || errorMessage) && (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">
          {invoice.errorMessage || errorMessage}
        </div>
      )}

      {reviewMessage && (
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 font-sans text-sm font-bold text-primary">
          {reviewMessage}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-surface-container-high px-5 py-3 font-sans text-xs font-extrabold text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 font-sans text-xs font-extrabold ${confidenceClassName[confidence]}`}>
          <Sparkles className="h-4 w-4" />
          OCR Confidence: {confidence}
        </span>
      </div>

      {canManageInvoices && (
        <section className="rounded-2xl border border-surface-container-high bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">Lifecycle Management</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Owner/Manager actions for archive, restore, rollback, and delete.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isImported && !isArchived && (
                <button type="button" onClick={handleRollbackImport} disabled={isProcessing || isLifecycleBusy} className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/5 px-4 py-2.5 font-sans text-xs font-extrabold text-secondary disabled:opacity-50">
                  <RotateCcw className="h-4 w-4" />
                  {lifecycleAction === 'rollback' ? 'Rolling Back...' : 'Rollback Import'}
                </button>
              )}
              {!isArchived ? (
                <button type="button" onClick={handleArchiveInvoice} disabled={isProcessing || isLifecycleBusy} className="inline-flex items-center gap-2 rounded-full border border-surface-container-high px-4 py-2.5 font-sans text-xs font-extrabold text-primary disabled:opacity-50">
                  <Archive className="h-4 w-4" />
                  {lifecycleAction === 'archive' ? 'Archiving...' : 'Archive'}
                </button>
              ) : (
                <button type="button" onClick={handleRestoreInvoice} disabled={isLifecycleBusy} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2.5 font-sans text-xs font-extrabold text-primary disabled:opacity-50">
                  <RotateCcw className="h-4 w-4" />
                  {lifecycleAction === 'restore' ? 'Restoring...' : 'Restore'}
                </button>
              )}
              <button type="button" onClick={handleDeleteInvoice} disabled={isProcessing || isLifecycleBusy} className="inline-flex items-center gap-2 rounded-full border border-error/30 bg-error/5 px-4 py-2.5 font-sans text-xs font-extrabold text-error disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
                {lifecycleAction === 'delete' ? 'Deleting...' : 'Delete Invoice'}
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-surface-container-high bg-surface-container-low p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Invoice Preview</p>
              <h2 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">{invoice.fileName}</h2>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setZoom(current => Math.max(0.75, current - 0.1))} className="rounded-full border border-surface-container-high p-2 text-primary"><ZoomOut className="h-4 w-4" /></button>
              <button type="button" onClick={() => setZoom(current => Math.min(1.5, current + 0.1))} className="rounded-full border border-surface-container-high p-2 text-primary"><ZoomIn className="h-4 w-4" /></button>
              <a href={invoice.fileUrl} download={invoice.fileName} className="rounded-full border border-surface-container-high p-2 text-primary"><Download className="h-4 w-4" /></a>
            </div>
          </div>

          <div className="relative h-[520px] overflow-auto rounded-2xl border border-surface-container-high bg-white p-4">
            {isProcessing && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/85 text-center backdrop-blur-sm">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div>
                  <p className="font-display text-xl font-bold text-primary">AI is reading this invoice</p>
                  <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Extracting supplier, totals, and line items for review.</p>
                </div>
              </div>
            )}
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} className="transition-transform">
              {isImageInvoice(invoice) ? (
                <img src={invoice.fileUrl} alt={invoice.fileName} className="max-w-full rounded-xl object-contain" />
              ) : isPdfInvoice(invoice) ? (
                <iframe title={invoice.fileName} src={invoice.fileUrl} className="h-[480px] w-full rounded-xl border border-surface-container-high" />
              ) : (
                <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-xl bg-surface-container-low text-center">
                  <FileSpreadsheet className="h-10 w-10 text-outline" />
                  <p className="font-sans text-sm font-bold text-on-surface-variant">Preview is not available for spreadsheet invoices yet.</p>
                  <a href={invoice.fileUrl} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary" target="_blank" rel="noreferrer">Download File</a>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-surface-container-high bg-white p-6 shadow-sm space-y-6">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">AI Import Summary</p>
            <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">Review Before Import</h3>
            <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Approve only after the OCR details match the supplier invoice.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {[
              ['Supplier', invoice.supplier || invoice.extractedData?.supplier || 'Not extracted yet'],
              ['Invoice Number', invoice.invoiceNumber || invoice.extractedData?.invoiceNumber || 'Not extracted yet'],
              ['Invoice Date', invoice.invoiceDate || invoice.extractedData?.invoiceDate || 'Not extracted yet'],
              ['Currency', currency || 'Not extracted yet'],
              ['Subtotal', formatMoney(subtotal, currency)],
              ['GST', formatMoney(gst, currency)],
              ['Total Items', String(extractedItems.length)],
              ['Total Amount', formatMoney(totalAmount, currency)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-surface-container-high bg-surface-container-low p-4">
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">{label}</p>
                <p className="mt-1 font-sans text-sm font-extrabold text-primary">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-surface-container-high p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Processing Status</span>
              <span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${statusClassName[invoice.processingStatus]}`}>{isProcessing ? 'Processing...' : invoice.processingStatus}</span>
            </div>
            <p className="mt-3 font-sans text-xs font-bold text-on-surface-variant">Uploaded {formatDate(invoice.uploadDate)}</p>
          </div>

          <div className="rounded-xl border border-surface-container-high bg-surface-container-low p-4">
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">OCR Metadata</p>
            <dl className="mt-3 space-y-2 font-sans text-xs font-bold text-on-surface-variant">
              <div className="flex items-center justify-between gap-3"><dt>OCR Model</dt><dd className="text-primary">Gemini 2.5 Flash</dd></div>
              <div className="flex items-center justify-between gap-3"><dt>Processed At</dt><dd className="text-primary">{formatDate(invoice.processingCompletedAt)}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt>Processing Time</dt><dd className="text-primary">{formatProcessingTime(invoice.processingStartedAt, invoice.processingCompletedAt)}</dd></div>
            </dl>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
            <button type="button" onClick={handleApproveImport} disabled={isProcessing || isImporting || isImported || isArchived || extractedItems.length === 0} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              {isImporting ? 'Approving...' : isImported ? 'Imported' : 'Approve Import'}
            </button>
            <button type="button" onClick={onBack} disabled={isProcessing} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-surface-container-high px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:cursor-not-allowed disabled:opacity-50">
              <XCircle className="h-4 w-4" />
              Cancel
            </button>
          </div>
          <button type="button" onClick={() => processInvoice(invoice.processingStatus === 'Pending' ? 'process' : 'reprocess')} disabled={isProcessing || isArchived} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:cursor-not-allowed disabled:opacity-50">
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            {isProcessing ? 'Processing Invoice...' : invoice.processingStatus === 'Pending' ? 'Process Invoice' : 'Reprocess'}
          </button>
        </aside>
      </div>

      <section className="rounded-2xl border border-surface-container-high bg-white p-5 sm:p-7 shadow-sm space-y-5">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Ingredient Matching</p>
          <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">Ingredient Review</h3>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Confirm whether each OCR item should update an existing ingredient or create a new one.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-surface-container-high bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-left font-sans text-sm">
            <thead className="bg-surface-container-low text-primary">
              <tr>
                {['OCR Item', 'Matched Ingredient', 'Status', 'Action'].map(header => <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {ingredientMatches.length > 0 ? ingredientMatches.map((match, index) => {
                const matchedIngredient = match.matchedIngredientId ? ingredients.find(ingredient => ingredient.id === match.matchedIngredientId) : null;
                const status = match.matchedIngredientId ? 'Matched' : 'New Ingredient';

                return (
                  <tr key={`${match.item.name}-${index}`} className="border-t border-surface-container-high align-top hover:bg-surface-container-low/50">
                    <td className="px-4 py-3 font-extrabold text-primary">{reviewItems[index]?.name || match.item.name || '-'}</td>
                    <td className="px-4 py-3 font-bold text-on-surface-variant">{matchedIngredient?.name || 'No existing ingredient selected'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${status === 'Matched' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{status}</span></td>
                    <td className="px-4 py-3">
                      <select
                        value={match.matchedIngredientId || ''}
                        onChange={event => handleMatchedIngredientChange(index, event.target.value)}
                        disabled={isImported || isImporting}
                        className="w-full min-w-[220px] rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
                      >
                        <option value="">Create new ingredient</option>
                        {ingredients.filter(ingredient => ingredient.status === 'Active').map(ingredient => (
                          <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center">
                    <p className="font-sans text-sm font-bold text-on-surface-variant">No OCR items are available for ingredient matching.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-surface-container-high bg-white p-5 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Extracted Items</p>
            <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">OCR Line Items</h3>
            <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Verify each extracted row before approving. This does not create ingredients yet.</p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 font-sans text-xs font-extrabold ${confidenceClassName[confidence]}`}>
            <Sparkles className="h-4 w-4" />
            {confidence} confidence
          </span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-surface-container-high bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left font-sans text-sm">
            <thead className="bg-surface-container-low text-primary">
              <tr>
                {['Item Name', 'Quantity', 'Unit', 'Unit Price', 'Line Total'].map(header => <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {extractedItems.length > 0 ? extractedItems.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="border-t border-surface-container-high align-top hover:bg-surface-container-low/50">
                  <td className="px-4 py-3">
                    <input
                      value={item.name}
                      onChange={event => handleReviewItemChange(index, 'name', event)}
                      className="w-full min-w-[220px] rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      aria-label={`Item ${index + 1} name`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.quantity || ''}
                      onChange={event => handleReviewItemChange(index, 'quantity', event)}
                      className="w-24 rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      aria-label={`Item ${index + 1} quantity`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={item.unit}
                      onChange={event => handleReviewItemChange(index, 'unit', event)}
                      className="w-28 rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      aria-label={`Item ${index + 1} unit`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.unitPrice || ''}
                      onChange={event => handleReviewItemChange(index, 'unitPrice', event)}
                      className="w-32 rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      aria-label={`Item ${index + 1} unit price`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.total || ''}
                      onChange={event => handleReviewItemChange(index, 'total', event)}
                      className="w-32 rounded-xl border border-surface-container-high bg-white px-3 py-2 font-sans text-sm font-bold text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      aria-label={`Item ${index + 1} total`}
                    />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <Loader2 className={`mx-auto h-8 w-8 text-outline ${isProcessing ? 'animate-spin text-primary' : ''}`} />
                    <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">
                      {isProcessing
                        ? 'AI is extracting line items...'
                        : invoice.processingStatus === 'Processed' && !hasOcrData
                          ? 'This invoice has been processed, but no OCR data was found.'
                          : invoice.processingStatus === 'Processed'
                            ? 'This invoice has OCR data, but no line items were extracted.'
                            : 'No extracted items yet. Process this invoice to run AI OCR.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <details className="rounded-2xl border border-surface-container-high bg-surface-container-low p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
            <span className="inline-flex items-center gap-2"><FileJson className="h-4 w-4" />Raw OCR JSON</span>
            <span className="text-[10px] text-outline">Click to expand</span>
          </summary>
          {hasOcrData ? (
            <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-white p-4 font-mono text-xs leading-relaxed text-primary">
              {rawOcrJson}
            </pre>
          ) : (
            <p className="mt-4 rounded-xl bg-white p-4 font-sans text-sm font-bold text-on-surface-variant">
              No raw OCR JSON is saved for this invoice.
            </p>
          )}
        </details>
      </section>
    </div>
  );
}
