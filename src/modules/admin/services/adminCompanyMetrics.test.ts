import assert from 'node:assert/strict';
import test from 'node:test';
import { countDistinctSuppliersByCompany } from './adminCompanyMetrics';

test('Admin supplier metrics preserve distinct supplier counts and legacy company ownership fallbacks', () => {
  const result = countDistinctSuppliersByCompany([
    { workspaceId: 'workspace-a', supplierId: 'supplier-1' },
    { workspaceId: 'workspace-a', supplierId: 'supplier-1' },
    { companyId: 'workspace-a', supplierId: 'supplier-2' },
    { createdBy: 'workspace-b', supplierId: 'supplier-3' },
    { userId: 'workspace-c', supplierId: 'supplier-4' },
    { workspaceId: 'workspace-a', supplierId: '' },
    { workspaceId: '', supplierId: 'supplier-without-owner' }
  ]);

  assert.deepEqual([...result.entries()].map(([companyId, suppliers]) => [companyId, [...suppliers].sort()]), [
    ['workspace-a', ['supplier-1', 'supplier-2']],
    ['workspace-b', ['supplier-3']],
    ['workspace-c', ['supplier-4']]
  ]);
});
