import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import Header from './Header';
import type { RegionCode, Workspace } from '../types';

const createWorkspace = (country: RegionCode): Workspace => ({
  id: `workspace-${country}`,
  name: 'Ce Lim Kitchen',
  ownerId: `workspace-${country}`,
  country,
  members: [],
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z'
});

const renderWorkspaceHeader = (country: RegionCode) => {
  const workspace = createWorkspace(country);
  return renderToStaticMarkup(
    <Header currentWorkspace={workspace} workspaces={[workspace]} />
  );
};

test('workspace country is visible as read-only workspace metadata', () => {
  assert.match(renderWorkspaceHeader('MY'), /Malaysia · Personal workspace/);
  assert.match(renderWorkspaceHeader('SG'), /Singapore · Personal workspace/);
});
