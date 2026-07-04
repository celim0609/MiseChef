import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import { invoiceProcessor, invoiceService } from '../../services';
import type { CostingInvoice, CostingInvoiceFileType, CostingInvoiceStatus } from '../../types';

interface CostingInvoicesPageProps {
  userId?: string;
  onOpenInvoice: (invoiceId: string) => void;
}

const statusClassName: Record<CostingInvoiceStatus, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Processing: 'bg-blue-100 text-blue-800',
  Processed: 'bg-green-100 text-green-800',
  Imported: 'bg-primary/10 text-primary',
  Failed: 'bg-red-100 text-red-800'
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

export default function CostingInvoicesPage({ userId, onOpenInvoice }: CostingInvoicesPageProps) {
  const singleUploadInputRef = useRef<HTMLInputElement | null>(null);
  const multipleUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<CostingInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [processingInvoiceId, setProcessingInvoiceId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadInvoices = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const invoices = await invoiceService.listInvoices(userId);
        if (!isCancelled) setInvoiceHistory(invoices);
      } catch (err) {
        if (!isCancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Unable to load invoices.');
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadInvoices();

    return () => {
      isCancelled = true;
    };
  }, [userId]);

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
      setErrorMessage(err instanceof Error ? err.message : 'Unable to upload invoice.');
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
      const errorText = err instanceof Error ? err.message : 'Unable to process invoice.';
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
            {(['Pending', 'Processing', 'Processed', 'Imported', 'Failed'] as CostingInvoiceStatus[]).map(status => (
              <span key={status} className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${statusClassName[status]}`}>{status}</span>
            ))}
          </div>
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
              {invoiceHistory.length > 0 ? invoiceHistory.map(invoice => (
                <tr key={invoice.id} className="border-t border-surface-container-high hover:bg-surface-container-low/60">
                  <td className="px-4 py-3 font-bold text-primary">
                    <button type="button" onClick={() => onOpenInvoice(invoice.id)} className="text-left hover:underline">
                      {invoice.fileName}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-bold text-on-surface-variant">{formatUploadDate(invoice.uploadDate)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 font-sans text-[10px] font-extrabold ${statusClassName[invoice.processingStatus]}`}>{processingInvoiceId === invoice.id ? 'Processing...' : invoice.processingStatus}</span></td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleProcessInvoice(invoice)}
                      disabled={invoice.processingStatus !== 'Pending' || processingInvoiceId === invoice.id}
                      className="rounded-full bg-primary px-4 py-2 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {processingInvoiceId === invoice.id ? 'Processing...' : invoice.processingStatus === 'Pending' ? 'Process Invoice' : invoice.processingStatus}
                    </button>
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
                    <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">No invoices uploaded yet.</p>
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
