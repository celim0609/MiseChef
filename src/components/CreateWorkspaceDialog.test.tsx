import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';

test('new Workspace flow exposes Malaysia and Singapore with their currencies', () => {
  const markup = renderToStaticMarkup(
    <CreateWorkspaceDialog
      isOpen
      onClose={() => undefined}
      onCreate={async () => undefined}
    />
  );

  assert.match(markup, /Operating Country/);
  assert.match(markup, /Malaysia \(MY\) · MYR/);
  assert.match(markup, /Singapore \(SG\) · SGD/);
  assert.match(markup, /Choose the Workspace operating country once/);
});

test('closed Workspace dialog renders nothing', () => {
  const markup = renderToStaticMarkup(
    <CreateWorkspaceDialog
      isOpen={false}
      onClose={() => undefined}
      onCreate={async () => undefined}
    />
  );

  assert.equal(markup, '');
});
