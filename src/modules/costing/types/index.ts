export type CostingInvoiceStatus = 'Pending' | 'Processing' | 'Processed' | 'Failed' | 'Imported' | 'Archived';
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
  approvedAt?: string | null;
  approvedBy?: string | null;
  archivedAt?: string;
  archivedBy?: string;
  restoredAt?: string;
  restoredBy?: string;
  rollbackAt?: string;
  rollbackBy?: string;
  rollbackReason?: string;
  previousStatus?: CostingInvoiceStatus;
  extractedData: CostingInvoiceExtractedData | null;
  errorMessage: string | null;
  createdBy: string;
  workspaceId?: string;
  size: number;
}

export interface CostingIngredientPriceHistory {
  id: string;
  ingredientId: string;
  supplierId: string;
  invoiceId: string;
  previousCost: number | null;
  newCost: number;
  unitPrice: number;
  currency: string;
  effectiveDate: string;
  createdAt: string;
  createdBy: string;
  workspaceId: string;
  rollbackStatus?: 'Active' | 'RolledBack';
  rolledBackAt?: string;
  rolledBackBy?: string;
}

export interface PendingRecipeCostRecalculation {
  id: string;
  recipeId: string;
  invoiceId: string;
  ingredientIds: string[];
  ingredientNames: string[];
  status: 'Pending';
  reason: 'IngredientCostChanged';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  workspaceId: string;
}
