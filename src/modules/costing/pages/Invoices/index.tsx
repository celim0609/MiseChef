import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Archive, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import { invoiceLifecycleService, invoiceProcessor, invoiceService } from '../../services';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import type { CostingInvoice, CostingInvoiceFileType, CostingInvoiceStatus } from '../../types';

interface CostingInvoicesPageProps {
  userId?: string;
  workspaceId?: string;
  canManageInvoices?: boolean;
  onOpenInvoice: (invoiceId: string) => void;
}

const statusClassName: Record<CostingInvoiceStatus, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Processing: 'bg-blue-100 text-blue-800',
  Processed: 'bg-green-100 text-green-800',
  Imported: 'bg-primary/10 text-primary',
  Failed: 'bg-red-100 text-red-800',
  Archived: 'bg-surface-container-high text-on-surface-variant'
};

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatUploadDate = (value: string) => value ? new Date(value).toLocaleString() : '';

const getFileType = (file: File): CostingInvoiceFileType => {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'PDF';
  if (file.type.startsWith('image/')) return 'Image';
  return 'Excel';
};

const isDirectDeleteStatus = (status: CostingInvoiceStatus) => ['Pending', 'Processed', 'Failed'].includes(status);
const invoiceStatuses: CostingInvoiceStatus[] = ['Pending', 'Processing', 'Processed', 'Imported', 'Failed', 'Archived'];

const getInitialStatusFilter = (): CostingInvoiceStatus | null => {
  const requestedStatus = new URLSearchParams(window.location.search).get('status');
  return invoiceStatuses.includes(requestedStatus as CostingInvoiceStatus)
    ? requestedStatus as CostingInvoiceStatus
    : null;
};

const getStatusFilterLabel = (status: CostingInvoiceStatus) => (
  status === 'Processed' ? 'Pending approval' : status
);

const notifyInvoiceLifecycleChanged = () => {
  window.dispatchEvent(new CustomEvent('misechef:invoice-lifecycle-changed'));
};

export default function CostingInvoicesPage({ userId, workspaceId, canManageInvoices = false, onOpenInvoice }: CostingInvoicesPageProps) {
  const singleUploadInputRef = useRef<HTMLInputElement | null>(null);
  const multipleUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<CostingInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [processingInvoiceId, setProcessingInvoiceId] = useState<string | null>(null);
  const [activeLifecycleInvoiceId, setActiveLifecycleInvoiceId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CostingInvoiceStatus | null>(getInitialStatusFilter);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadInvoices = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const invoices = await invoiceService.listInvoices(userId, { includeArchived: showArchived, workspaceId: workspaceId || userId });
        if (!isCancelled) setInvoiceHistory(invoices);
      } catch (err) {
        if (!isCancelled) {
          setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to load invoices.'));
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadInvoices();

    return () => {
      isCancelled = true;
    };
  }, [showArchived, userId, workspaceId]);

  const handleInvoiceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) as File[] : [];
    if (files.length === 0) return;

    if (!userId) {
      setErrorMessage('Sign in to upload invoices.');
      event.target.value = '';
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setMessage('');
    setErrorMessage('');

    try {
      const uploadedInvoices: CostingInvoice[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const invoice = await invoiceService.uploadInvoice({
          file,
          fileType: getFileType(file),
          userId,
          workspaceId: workspaceId || userId,
          onProgress: progress => {
            const fileOffset = (index / files.length) * 100;
            setUploadProgress(Math.round(fileOffset + (progress / files.length)));
          }
        });
        uploadedInvoices.push(invoice);
      }

      setInvoiceHistory(current => [...uploadedInvoices, ...current]);
      setMessage(files.length === 1 ? 'Invoice uploaded.' : `${files.length} invoices uploaded.`);
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to upload invoice.'));
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      event.target.value = '';
    }
  };

  const updateInvoiceInHistory = (invoiceId: string, updates: Partial<CostingInvoice>) => {
    setInvoiceHistory(current => current.map(invoice => (
      invoice.id === invoiceId ? { ...invoice, ...updates } : invoice
    )));
  };

  const removeInvoiceFromHistory = (invoiceId: string) => {
    setInvoiceHistory(current => current.filter(invoice => invoice.id !== invoiceId));
  };

  const handleArchiveInvoice = async (invoice: CostingInvoice) => {
    if (!userId || !canManageInvoices) return;
    setActiveLifecycleInvoiceId(invoice.id);
    setErrorMessage('');
    setMessage('');

    try {
      const updates = await invoiceService.archiveInvoice(invoice, userId);
      if (showArchived) {
        updateInvoiceInHistory(invoice.id, updates);
      } else {
        removeInvoiceFromHistory(invoice.id);
      }
      notifyInvoiceLifecycleChanged();
      setMessage('Invoice archived. It is hidden from the default history view.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to archive invoice.'));
    } finally {
      setActiveLifecycleInvoiceId(null);
    }
  };

  const handleRestoreInvoice = async (invoice: CostingInvoice) => {
    if (!userId || !canManageInvoices) return;
    setActiveLifecycleInvoiceId(invoice.id);
    setErrorMessage('');
    setMessage('');

    try {
      const updates = await invoiceService.restoreInvoice(invoice, userId);
      updateInvoiceInHistory(invoice.id, updates);
      notifyInvoiceLifecycleChanged();
      setMessage('Invoice restored.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to restore invoice.'));
    } finally {
      setActiveLifecycleInvoiceId(null);
    }
  };

  const handleDeleteInvoice = async (invoice: CostingInvoice) => {
    if (!userId || !canManageInvoices) return;

    const isImported = invoice.processingStatus === 'Imported' || Boolean(invoice.approvedAt);
    const confirmed = window.confirm(isImported
      ? 'Delete this imported invoice?\n\nThis will roll back imported ingredient changes, mark price history as rolled back, queue recipe recalculation, delete the invoice record, and delete the uploaded file.'
      : 'Delete this invoice?\n\nThis will remove the invoice, uploaded file, and extracted details.');
    if (!confirmed) return;

    setActiveLifecycleInvoiceId(invoice.id);
    setErrorMessage('');
    setMessage('');

    try {
      if (isImported) {
        await invoiceLifecycleService.rollbackImport({ invoice, userId, workspaceId: workspaceId || userId });
      } else if (!isDirectDeleteStatus(invoice.processingStatus)) {
        throw new Error('Only Pending, Processed, Failed, or Imported invoices can be deleted.');
      }
      await invoiceService.deleteInvoice(invoice, userId);
      removeInvoiceFromHistory(invoice.id);
      notifyInvoiceLifecycleChanged();
      setMessage(isImported ? 'Imported invoice rolled back and deleted.' : 'Invoice deleted.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to delete invoice.'));
    } finally {
      setActiveLifecycleInvoiceId(null);
    }
  };

  const handleProcessInvoice = async (invoice: CostingInvoice) => {
    if (invoice.processingStatus !== 'Pending') return;

    const processingStartedAt = new Date().toISOString();
    setProcessingInvoiceId(invoice.id);
    setMessage('');
    setErrorMessage('');
    updateInvoiceInHistory(invoice.id, {
      processingStatus: 'Processing',
      status: 'Processing',
      processingStartedAt,
      errorMessage: null
    });

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
      updateInvoiceInHistory(invoice.id, processedUpdates);
      setMessage('Invoice OCR completed.');
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
      updateInvoiceInHistory(invoice.id, failedUpdates);
      setErrorMessage(errorText);
    } finally {
      setProcessingInvoiceId(null);
    }
  };

  const visibleInvoices = invoiceHistory.filter(invoice => {
    if (statusFilter && invoice.processingStatus !== statusFilter) return false;

    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    return [
      invoice.fileName,
      invoice.supplier,
      invoice.invoiceNumber,
      invoice.processingStatus,
      invoice.status
    ].some(value => String(value || '').toLowerCase().includes(query));
  });

  const clearStatusFilter = () => {
    setStatusFilter(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm">
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Costing</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">Invoice Upload</h2>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Upload supplier invoices now. OCR, AI parsing, ingredient creation, and costing calculations will be added later.</p>
      </section>

      <section className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-sans text-xs font-extrabold text-primary uppercase tracking-[0.16em]">Invoice Center</p>
            <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Supported files: PDF, images, Excel, and CSV exports.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => singleUploadInputRef.current?.click()} disabled={isUploading} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary shadow-sm active:scale-95 transition-all disabled:opacity-50">
              Upload Invoice
            </button>
            <button type="button" onClick={() => multipleUploadInputRef.current?.click()} disabled={isUploading} className="rounded-full border border-surface-container-high px-5 py-3 font-sans text-xs font-extrabold text-primary active:scale-95 transition-all disabled:opacity-50">
              Upload Multiple
            </button>
            <button type="button" onClick={() => setShowArchived(current => !current)} className="rounded-full border border-surface-container-high px-5 py-3 font-sans text-xs font-extrabold text-primary active:scale-95 transition-all">
              {showArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
          </div>
        </div>

        <input ref={singleUploadInputRef} type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={handleInvoiceUpload} className="hidden" />
        <input ref={multipleUploadInputRef} type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" multiple onChange={handleInvoiceUpload} className="hidden" />

        {isUploading && uploadProgress !== null && <p className="font-sans text-xs font-extrabold text-secondary">Uploading invoices... {uploadProgress}%</p>}
        {message && <p className="font-sans text-xs font-extrabold text-primary">{message}</p>}
        {errorMessage && <p className="font-sans text-xs font-extrabold text-error">{errorMessage}</p>}
      </section>

      <section className="rounded-2xl border border-surface-container-high bg-surface-container-low p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Invoice Workflow</p>
            <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">Invoice History</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['Pending', 'Processing', 'Processed', 'Imported', 'Failed', 'Archived'] as CostingInvoiceStatus[]).map(status => (
              <span key={status} className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${statusClassName[status]}`}>{status}</span>
            ))}
          </div>
        </div>

        <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search invoices, suppliers, numbers, status..."
              className="w-full rounded-full border border-surface-container-high bg-white py-3 pl-11 pr-4 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </label>
          {statusFilter && (
            <button
              type="button"
              onClick={clearStatusFilter}
              className="w-fit rounded-full border border-primary/20 bg-primary/10 px-4 py-2 font-sans text-xs font-extrabold text-primary transition-colors hover:bg-primary/15"
              aria-label={`Clear ${getStatusFilterLabel(statusFilter)} filter`}
            >
              {getStatusFilterLabel(statusFilter)} ×
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-surface-container-high bg-white">
          <table className="w-full min-w-[640px] text-left font-sans text-sm">
            <thead className="bg-surface-container-low text-primary">
              <tr>
                <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">File Name</th>
                <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">Upload Date</th>
                <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">Processing Status</th>
                <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.length > 0 ? visibleInvoices.map(invoice => (
                <tr key={invoice.id} className="border-t border-surface-container-high hover:bg-surface-container-low/60">
                  <td className="px-4 py-3 font-bold text-primary">
                    <button type="button" onClick={() => onOpenInvoice(invoice.id)} className="text-left hover:underline">
                      {invoice.fileName}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{formatUploadDate(invoice.uploadDate)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${statusClassName[invoice.processingStatus]}`}>{processingInvoiceId === invoice.id ? 'Processing...' : invoice.processingStatus}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleProcessInvoice(invoice)}
                        disabled={invoice.processingStatus !== 'Pending' || processingInvoiceId === invoice.id}
                        className="rounded-full bg-primary px-4 py-2 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {processingInvoiceId === invoice.id ? 'Processing...' : invoice.processingStatus === 'Pending' ? 'Process Invoice' : invoice.processingStatus}
                      </button>
                      {canManageInvoices && invoice.processingStatus !== 'Archived' && (
                        <button type="button" onClick={() => handleArchiveInvoice(invoice)} disabled={activeLifecycleInvoiceId === invoice.id || invoice.processingStatus === 'Processing'} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-50">
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canManageInvoices && invoice.processingStatus === 'Archived' && (
                        <button type="button" onClick={() => handleRestoreInvoice(invoice)} disabled={activeLifecycleInvoiceId === invoice.id} className="rounded-full border border-primary/30 px-3 py-2 font-sans text-xs font-extrabold text-primary disabled:opacity-50">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canManageInvoices && invoice.processingStatus !== 'Processing' && (
                        <button type="button" onClick={() => handleDeleteInvoice(invoice)} disabled={activeLifecycleInvoiceId === invoice.id} className="rounded-full border border-error/30 px-3 py-2 font-sans text-xs font-extrabold text-error disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center">
                    <p className="font-sans text-sm font-bold text-on-surface-variant">Loading invoices...</p>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center">
                    <Upload className="mx-auto h-8 w-8 text-outline" />
                    <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">
                      {searchQuery || statusFilter ? 'No invoices match your filters.' : 'No invoices uploaded yet.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
