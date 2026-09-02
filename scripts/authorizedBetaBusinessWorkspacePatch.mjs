import assert from 'node:assert/strict';

export const PRODUCTION_WORKSPACE_COUNTRY = 'MY';

const readCountry = workspace => workspace?.fields?.country?.stringValue || '';

export const planProductionWorkspaceCountryPatch = workspace => {
  assert(workspace, 'Production workspace is missing.');
  assert(workspace.name, 'Production workspace document name is missing.');
  assert(workspace.updateTime, 'Production workspace updateTime is required for a protected patch.');

  const existingCountry = readCountry(workspace);
  if (existingCountry) {
    assert.equal(
      existingCountry,
      PRODUCTION_WORKSPACE_COUNTRY,
      `Production workspace country ${existingCountry} does not match required country ${PRODUCTION_WORKSPACE_COUNTRY}.`
    );
    return { required: false, existingCountry };
  }

  return {
    required: true,
    existingCountry: '',
    write: {
      update: {
        name: workspace.name,
        fields: { country: { stringValue: PRODUCTION_WORKSPACE_COUNTRY } }
      },
      updateMask: { fieldPaths: ['country'] },
      currentDocument: { updateTime: workspace.updateTime }
    }
  };
};

export const validateProductionWorkspaceCountry = workspace => {
  assert(workspace, 'Production workspace is missing.');
  const country = readCountry(workspace);
  assert.equal(
    country,
    PRODUCTION_WORKSPACE_COUNTRY,
    `Production workspace country ${country || '(missing)'} does not match required country ${PRODUCTION_WORKSPACE_COUNTRY}.`
  );
  return country;
};
