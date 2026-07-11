export type SupplierStatus = 'Active' | 'Archived';

export interface Supplier {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  paymentTerms: string;
  deliveryDays: number | null;
  gstRegistered: boolean;
  notes: string;
  status: SupplierStatus;
  totalQuotations: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  createdBy: string;
  workspaceId: string;
}

export interface SupplierDraft {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  paymentTerms: string;
  deliveryDays: number | null;
  gstRegistered: boolean;
  notes: string;
}

export interface SupplierValidationErrors {
  companyName?: string;
  currency?: string;
}

export interface SupplierFilters {
  searchTerm: string;
  status: 'Active' | 'Archived' | 'All';
}

export interface SupplierQuotation {
  id: string;
  supplierId: string;
  supplierName: string;
  ingredientId?: string;
  ingredientName: string;
  sku: string;
  brand: string;
  packSize: string;
  unit: string;
  unitPrice: number;
  currency: string;
  gstIncluded: boolean;
  effectiveDate: string;
  expiryDate?: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  workspaceId?: string;
}

export type SupplierInput = SupplierDraft;

export type SupplierQuotationInput = Omit<
  SupplierQuotation,
  'id' | 'supplierName' | 'isActive' | 'createdAt' | 'updatedAt'
>;

export interface SupplierQuotationSummary {
  totalSuppliers: number;
  activeSuppliers: number;
  archivedSuppliers: number;
  totalQuotations: number;
  activeQuotations: number;
  latestQuotationDate: string | null;
}
