import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const CONTRACT_COLLECTIONS = [
  'capabilities',
  'sourceModules',
  'firestoreCapabilities',
  'storageCapabilities',
  'indexes',
  'hostingRewrites',
  'routes',
  'navigation'
];
const FUNCTION_BUILDERS = new Set([
  'onCall',
  'onRequest',
  'onDocumentCreated',
  'onDocumentWritten',
  'onSchedule'
]);
export const MANDATORY_BETA_CAPABILITY_AUTHORITY = '472a4a8412ff97a726b902f94cfa703dc7bbad0d';

const parseJson = (text, label) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
};

const sortValue = value => Array.isArray(value)
  ? value.map(sortValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]))
    : value;
const canonical = value => JSON.stringify(sortValue(value));

const unwrapExpression = expression => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const calleeName = expression => {
  const callee = unwrapExpression(expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
};

export const discoverFirebaseFunctions = sourceText => {
  const sourceFile = ts.createSourceFile('functions/index.js', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const discovered = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const initializer = unwrapExpression(declaration.initializer);
      if (!ts.isCallExpression(initializer)) continue;
      if (FUNCTION_BUILDERS.has(calleeName(initializer.expression))) discovered.add(declaration.name.text);
    }
  }

  return [...discovered].sort();
};

const sourceFacts = (filePath, sourceText) => {
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX
    : filePath.endsWith('.jsx') ? ts.ScriptKind.JSX
      : filePath.endsWith('.js') || filePath.endsWith('.mjs') ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, kind);
  const identifiers = new Set();
  const strings = new Set();
  const regexes = new Set();
  const expressions = new Set();

  const visit = node => {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if (ts.isStringLiteralLike(node)) strings.add(node.text);
    if (ts.isRegularExpressionLiteral(node)) {
      const literal = node.text;
      const lastSlash = literal.lastIndexOf('/');
      regexes.add(literal.slice(1, lastSlash));
    }
    expressions.add(node.getText(sourceFile).replace(/\s+/g, ''));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { sourceFile, identifiers, strings, regexes, expressions };
};

const moduleSpecifiers = sourceFile => {
  const found = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

const resolveSourceModule = (root, fromFile, specifier) => {
  if (!specifier.startsWith('.')) return undefined;
  const unresolved = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.ts`, `${unresolved}.tsx`, `${unresolved}.js`, `${unresolved}.jsx`,
    path.join(unresolved, 'index.ts'), path.join(unresolved, 'index.tsx'),
    path.join(unresolved, 'index.js'), path.join(unresolved, 'index.jsx')
  ];
  return candidates.find(candidate => candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile());
};

const reachableSourceFiles = root => {
  const entry = path.join(root, 'src/main.tsx');
  const pending = existsSync(entry) ? [entry] : [];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const text = readFileSync(current, 'utf8');
    const facts = sourceFacts(current, text);
    for (const specifier of moduleSpecifiers(facts.sourceFile)) {
      const resolved = resolveSourceModule(root, current, specifier);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }
  return visited;
};

const validateRemovalRecords = (removals, baselineRelease, errors) => {
  const approved = new Map();
  if (removals?.schemaVersion !== 1 || !Array.isArray(removals?.removals)) {
    errors.push('config/beta-capability-removals.json must use schemaVersion 1 and contain a removals array');
    return approved;
  }
  for (const [index, removal] of removals.removals.entries()) {
    const label = `removals[${index}]`;
    const validTimestamp = typeof removal.approvedAt === 'string' && !Number.isNaN(Date.parse(removal.approvedAt));
    const valid = typeof removal.capabilityId === 'string' && removal.capabilityId.length > 0
      && removal.approved === true
      && typeof removal.reason === 'string' && removal.reason.trim().length > 0
      && typeof removal.approvedBy === 'string' && removal.approvedBy.trim().length > 0
      && validTimestamp
      && typeof removal.reviewReference === 'string' && removal.reviewReference.trim().length > 0
      && Number.isInteger(removal.targetRelease) && removal.targetRelease > baselineRelease;
    if (!valid) {
      errors.push(`${label} is malformed or unapproved; exact id, reason, reviewer, timestamp, review reference, approval, and a later target release are required`);
      continue;
    }
    if (approved.has(removal.capabilityId)) {
      errors.push(`${label} duplicates removal record ${removal.capabilityId}`);
      continue;
    }
    approved.set(removal.capabilityId, removal);
  }
  return approved;
};

const reportMissing = (id, message, approvedRemovals, errors, acceptedRemovals) => {
  if (approvedRemovals.has(id)) {
    acceptedRemovals.add(id);
    return;
  }
  errors.push(`${id}: ${message}`);
};

const contractEntryMap = (contract, collection) => new Map((contract[collection] || []).map(entry => [entry.id, entry]));

const compareProtectedContract = (protectedContract, candidateContract, approvedRemovals, errors, acceptedRemovals) => {
  for (const collection of CONTRACT_COLLECTIONS) {
    const candidate = contractEntryMap(candidateContract, collection);
    for (const protectedEntry of protectedContract[collection] || []) {
      const entry = candidate.get(protectedEntry.id);
      if (!entry) {
        reportMissing(protectedEntry.id, `deleted from candidate ${collection} contract`, approvedRemovals, errors, acceptedRemovals);
      } else if (canonical(entry) !== canonical(protectedEntry)) {
        reportMissing(protectedEntry.id, `changed from the protected Release #${protectedContract.baseline.release} contract`, approvedRemovals, errors, acceptedRemovals);
      }
    }
  }
  const candidateFunctions = new Set(candidateContract.cloudFunctions || []);
  for (const functionName of protectedContract.cloudFunctions || []) {
    const id = `function.${functionName}`;
    if (!candidateFunctions.has(functionName)) {
      reportMissing(id, 'deleted from candidate cloudFunctions contract', approvedRemovals, errors, acceptedRemovals);
    }
  }
};

export const readProtectedContract = (gitRepositoryRoot, authority) => {
  if (!authority || authority.schemaVersion !== 1 || !/^[0-9a-f]{40}$/.test(authority.contractCommit || '') || typeof authority.contractPath !== 'string') {
    throw new Error('config/beta-capability-authority.json is malformed');
  }
  if (authority.contractCommit !== MANDATORY_BETA_CAPABILITY_AUTHORITY) {
    throw new Error(
      `Capability authority ${authority.contractCommit} does not match the mandatory accepted authority ${MANDATORY_BETA_CAPABILITY_AUTHORITY}`
    );
  }
  const content = execFileSync('git', ['show', `${authority.contractCommit}:${authority.contractPath}`], {
    cwd: gitRepositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return parseJson(content, 'protected Beta capability contract');
};

const objectWithoutId = object => Object.fromEntries(Object.entries(object).filter(([key]) => key !== 'id'));
const containsObject = (items, protectedItem) => items.some(item => canonical(item) === canonical(objectWithoutId(protectedItem)));

export const validateBetaCapabilities = ({
  candidateRoot,
  trustedRoot,
  authorityGitRoot,
  contract,
  protectedContract,
  removals,
  authority
} = {}) => {
  if (!candidateRoot || !trustedRoot) {
    throw new Error('Both candidateRoot and trustedRoot are required; validation never infers a candidate tree from trusted gate files.');
  }
  const root = path.resolve(candidateRoot);
  const trustRoot = path.resolve(trustedRoot);
  const readCandidateJson = file => parseJson(readFileSync(path.join(root, file), 'utf8'), `candidate ${file}`);
  const readTrustedJson = file => parseJson(readFileSync(path.join(trustRoot, file), 'utf8'), `trusted ${file}`);
  const candidate = contract || readCandidateJson('config/beta-capabilities.json');
  const removalConfig = removals || readTrustedJson('config/beta-capability-removals.json');
  const authorityConfig = authority || (!protectedContract ? readTrustedJson('config/beta-capability-authority.json') : undefined);
  const protectedCandidate = protectedContract || readProtectedContract(path.resolve(authorityGitRoot || trustRoot), authorityConfig);
  const errors = [];
  const acceptedRemovals = new Set();

  if (candidate.schemaVersion !== 1 || protectedCandidate.schemaVersion !== 1) errors.push('Capability contracts must use schemaVersion 1');
  if (candidate.baseline?.sourceCommit !== protectedCandidate.baseline?.sourceCommit || candidate.baseline?.sourceTree !== protectedCandidate.baseline?.sourceTree) {
    errors.push('Candidate contract baseline identity differs from the protected contract');
  }

  const approvedRemovals = validateRemovalRecords(removalConfig, protectedCandidate.baseline?.release || 0, errors);
  compareProtectedContract(protectedCandidate, candidate, approvedRemovals, errors, acceptedRemovals);

  const allIds = new Set();
  for (const collection of CONTRACT_COLLECTIONS) {
    for (const entry of candidate[collection] || []) {
      if (!entry.id || allIds.has(entry.id)) errors.push(`${collection}: missing or duplicate stable id ${entry.id || '<empty>'}`);
      allIds.add(entry.id);
    }
  }
  for (const name of candidate.cloudFunctions || []) allIds.add(`function.${name}`);
  for (const capability of candidate.capabilities || []) {
    for (const requirement of capability.requires || []) {
      if (!allIds.has(requirement) && !approvedRemovals.has(requirement)) errors.push(`${capability.id}: unknown requirement ${requirement}`);
    }
  }

  const reachable = reachableSourceFiles(root);
  const factsByFile = new Map();
  const factsFor = relativeFile => {
    if (factsByFile.has(relativeFile)) return factsByFile.get(relativeFile);
    const absolute = path.join(root, relativeFile);
    if (!existsSync(absolute)) return undefined;
    const facts = sourceFacts(relativeFile, readFileSync(absolute, 'utf8'));
    factsByFile.set(relativeFile, facts);
    return facts;
  };

  for (const module of candidate.sourceModules || []) {
    const facts = factsFor(module.file);
    if (!facts) {
      reportMissing(module.id, `${module.file} is missing`, approvedRemovals, errors, acceptedRemovals);
      continue;
    }
    for (const identifier of module.identifiers || []) {
      if (!facts.identifiers.has(identifier) && !facts.strings.has(identifier)) {
        reportMissing(module.id, `${identifier} is absent from the ${module.file} AST`, approvedRemovals, errors, acceptedRemovals);
      }
    }
    if (module.reachable && !reachable.has(path.join(root, module.file))) {
      reportMissing(module.id, `${module.file} is no longer reachable from src/main.tsx`, approvedRemovals, errors, acceptedRemovals);
    }
  }

  const discoveredFunctions = discoverFirebaseFunctions(readFileSync(path.join(root, 'functions/index.js'), 'utf8'));
  const discoveredFunctionSet = new Set(discoveredFunctions);
  for (const name of candidate.cloudFunctions || []) {
    if (!discoveredFunctionSet.has(name)) reportMissing(`function.${name}`, 'Firebase Function export is absent from the AST', approvedRemovals, errors, acceptedRemovals);
  }

  const firestoreRules = readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  for (const capability of candidate.firestoreCapabilities || []) {
    const required = [capability.scope, capability.match, ...(capability.requires || [])].filter(Boolean);
    if (!required.every(value => firestoreRules.includes(value))) {
      reportMissing(capability.id, 'required Firestore match scope or rule evidence is absent', approvedRemovals, errors, acceptedRemovals);
    }
  }
  const storageRules = readFileSync(path.join(root, 'storage.rules'), 'utf8');
  for (const capability of candidate.storageCapabilities || []) {
    if (!storageRules.includes(capability.path)) reportMissing(capability.id, `Storage match ${capability.path} is absent`, approvedRemovals, errors, acceptedRemovals);
  }

  const indexes = readCandidateJson('firestore.indexes.json').indexes || [];
  for (const index of candidate.indexes || []) {
    if (!containsObject(indexes, index)) reportMissing(index.id, 'protected composite index is absent or changed', approvedRemovals, errors, acceptedRemovals);
  }
  const rewrites = readCandidateJson('firebase.json').hosting?.rewrites || [];
  for (const rewrite of candidate.hostingRewrites || []) {
    if (!containsObject(rewrites, rewrite)) reportMissing(rewrite.id, 'protected Hosting rewrite is absent or changed', approvedRemovals, errors, acceptedRemovals);
  }

  for (const entry of [...(candidate.routes || []), ...(candidate.navigation || [])]) {
    const facts = factsFor(entry.file);
    const present = facts && (entry.kind === 'literal' ? facts.strings.has(entry.value)
      : entry.kind === 'regex' ? facts.regexes.has(entry.value)
        : facts.expressions.has(entry.value.replace(/\s+/g, '')));
    if (!present) reportMissing(entry.id, `${entry.kind} ${entry.value} is absent from ${entry.file}`, approvedRemovals, errors, acceptedRemovals);
  }

  for (const removalId of approvedRemovals.keys()) {
    if (!acceptedRemovals.has(removalId)) errors.push(`${removalId}: removal record is stale because no protected regression uses it`);
  }

  const protectedFunctions = new Set(candidate.cloudFunctions || []);
  return {
    ok: errors.length === 0,
    errors,
    counts: {
      capabilities: (candidate.capabilities || []).length,
      sourceModules: (candidate.sourceModules || []).length,
      protectedFunctions: protectedFunctions.size,
      discoveredFunctions: discoveredFunctions.length,
      firestoreCapabilities: (candidate.firestoreCapabilities || []).length,
      storageCapabilities: (candidate.storageCapabilities || []).length,
      indexes: (candidate.indexes || []).length,
      hostingRewrites: (candidate.hostingRewrites || []).length,
      routes: (candidate.routes || []).length,
      navigation: (candidate.navigation || []).length
    },
    additions: {
      functions: discoveredFunctions.filter(name => !protectedFunctions.has(name))
    },
    acceptedRemovals: [...acceptedRemovals].sort()
  };
};

export const validateTrustedGate = ({ trustedRoot, authorityGitRoot } = {}) => {
  if (!trustedRoot) throw new Error('trustedRoot is required for gate-integrity validation.');
  const trustRoot = path.resolve(trustedRoot);
  const readTrustedJson = file => parseJson(readFileSync(path.join(trustRoot, file), 'utf8'), `trusted ${file}`);
  const contract = readTrustedJson('config/beta-capabilities.json');
  const authority = readTrustedJson('config/beta-capability-authority.json');
  const removals = readTrustedJson('config/beta-capability-removals.json');
  const baseline = readTrustedJson('config/beta-release-baseline.json');
  const protectedContract = readProtectedContract(path.resolve(authorityGitRoot || trustRoot), authority);
  const errors = [];
  const acceptedRemovals = new Set();
  const approvedRemovals = validateRemovalRecords(removals, protectedContract.baseline?.release || 0, errors);

  if (baseline.minimumCommit !== protectedContract.baseline?.sourceCommit) {
    errors.push('Trusted release baseline does not match the immutable capability contract baseline.');
  }
  if (canonical(contract) !== canonical(protectedContract)) {
    errors.push('Trusted working contract differs from the immutable contract stored at the authority commit.');
  }
  compareProtectedContract(protectedContract, contract, approvedRemovals, errors, acceptedRemovals);
  for (const removalId of approvedRemovals.keys()) {
    if (!acceptedRemovals.has(removalId)) errors.push(`${removalId}: trusted removal record is stale`);
  }

  return {
    ok: errors.length === 0,
    errors,
    baselineCommit: baseline.minimumCommit,
    authorityCommit: authority.contractCommit,
    contractId: contract.contractId
  };
};

export const assertBetaCapabilities = options => {
  const report = validateBetaCapabilities(options);
  if (!report.ok) throw new Error(`Beta capability regression detected:\n- ${report.errors.join('\n- ')}`);
  return report;
};

export const assertTrustedGate = options => {
  const report = validateTrustedGate(options);
  if (!report.ok) throw new Error(`Trusted Beta gate integrity failure:\n- ${report.errors.join('\n- ')}`);
  return report;
};
