const readString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : '';

const getDocumentCompanyId = (data: Record<string, unknown>) => readString(data.companyId)
  || readString(data.workspaceId)
  || readString(data.createdBy)
  || readString(data.userId);

export const countDistinctSuppliersByCompany = (ingredients: Array<Record<string, unknown>>) => {
  const suppliersByCompany = new Map<string, Set<string>>();

  ingredients.forEach(ingredient => {
    const companyId = getDocumentCompanyId(ingredient);
    const supplierId = readString(ingredient.supplierId);
    if (!companyId || !supplierId) return;

    const current = suppliersByCompany.get(companyId) || new Set<string>();
    current.add(supplierId);
    suppliersByCompany.set(companyId, current);
  });

  return suppliersByCompany;
};
