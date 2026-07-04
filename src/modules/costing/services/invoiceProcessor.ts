import type { CostingInvoice, CostingInvoiceExtractedData } from '../types';
import { invoiceOcrService } from './invoiceOcrService';

export interface InvoiceProcessingProvider {
  process(invoice: CostingInvoice): Promise<{
    extractedData: CostingInvoiceExtractedData | null;
  }>;
}

export class SimulatedInvoiceProcessingProvider implements InvoiceProcessingProvider {
  async process(): Promise<{ extractedData: CostingInvoiceExtractedData | null }> {
    await new Promise(resolve => setTimeout(resolve, 1200));
    return { extractedData: null };
  }
}

export class AiInvoiceOcrProcessingProvider implements InvoiceProcessingProvider {
  async process(invoice: CostingInvoice): Promise<{ extractedData: CostingInvoiceExtractedData }> {
    return { extractedData: await invoiceOcrService.extractInvoice(invoice) };
  }
}

export const invoiceProcessor = {
  async processInvoice(invoice: CostingInvoice, provider: InvoiceProcessingProvider = new AiInvoiceOcrProcessingProvider()) {
    return provider.process(invoice);
  }
};
