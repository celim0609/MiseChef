import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceRegionProvider, useWorkspaceRegion } from './index';
import type { RegionCode } from './types';

const RegionProbe = () => {
  const region = useWorkspaceRegion();
  return <span>{region.country}:{region.currency}</span>;
};

const renderRegion = (country: RegionCode) => renderToStaticMarkup(
  <WorkspaceRegionProvider workspace={{ country }}>
    <RegionProbe />
  </WorkspaceRegionProvider>
);

test('the shared provider follows the active workspace when accounts or workspaces switch', () => {
  assert.equal(renderRegion('MY'), '<span>MY:MYR</span>');
  assert.equal(renderRegion('SG'), '<span>SG:SGD</span>');
});
