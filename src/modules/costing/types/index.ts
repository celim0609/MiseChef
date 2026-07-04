export type CostingInvoiceStatus = 'Pending' | 'Processing' | 'Processed' | 'Failed' | 'Imported';
export type CostingInvoiceFileType = 'PDF' | 'Image' | 'Excel';
export type CostingIngredientStatus = 'Active' | 'Archived';

export interface CostingIngredient {
  id: string;
  name: string;
  category: string;
  purchaseUnit: string;
  recipeUnit: string;
  conversionFactor: number;
  currentPrice: number;
  currency: string;
  supplierId: string;
  yieldPercentage: number;
  wastePercentage: number;
  status: CostingIngredientStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  workspaceId: string;
}

export interface CostingInvoiceExtractedItem {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface CostingInvoiceExtractedData {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  subtotal: number;
  gst: number;
  total: number;
  items: CostingInvoiceExtractedItem[];
}

export interface CostingInvoice {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: CostingInvoiceFileType;
  uploadDate: string;
  status: CostingInvoiceStatus;
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: string;
  subtotal?: number;
  gst?: number;
  total?: number;
  processingStatus: CostingInvoiceStatus;
  processingStartedAt?: string;
  processingCompletedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  extractedData: CostingInvoiceExtractedData | null;
  errorMessage: string | null;
  createdBy: string;
  size: number;
}

export interface CostingIngredientPriceHistory {
  id: string;
  ingredientId: string;
  supplierId: string;
  invoiceId: string;
  unitPrice: number;
  currency: string;
  effectiveDate: string;
  createdAt: string;
  createdBy: string;
  workspaceId: string;
}
