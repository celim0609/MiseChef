import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepositoryFile = filePath => readFileSync(path.join(repositoryRoot, filePath), 'utf8');
const baseline = JSON.parse(readRepositoryFile('config/beta-release-baseline.json'));
const firebaseProjects = JSON.parse(readRepositoryFile('.firebaserc')).projects || {};

if (process.env.FIREBASE_DEPLOY_TARGET !== 'beta') {
  console.log('Beta release baseline check skipped because FIREBASE_DEPLOY_TARGET is not beta.');
  process.exit(0);
}

if (firebaseProjects.beta !== baseline.projectId || baseline.projectId !== 'misechef-beta-fa4bf') {
  throw new Error('Beta project mapping does not match the protected misechef-beta-fa4bf release target.');
}

const git = args => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const candidateCommit = git(['rev-parse', 'HEAD']);

try {
  execFileSync('git', ['merge-base', '--is-ancestor', baseline.minimumCommit, candidateCommit], {
    cwd: repositoryRoot,
    stdio: 'ignore'
  });
} catch {
  throw new Error(
    `Beta deploy candidate ${candidateCommit} is not descended from protected baseline ${baseline.minimumCommit}. ` +
    'Integrate the latest Beta release before building or deploying.'
  );
}

const requiredSourceMarkers = [
  ['src/types.ts', "| 'personalExpenses'", 'Finance root tab'],
  ['src/App.tsx', "case 'personalExpenses':", 'Finance route renderer'],
  ['src/navigation/financeNavigation.ts', '/app/finance/personal-expenses', 'Finance direct route'],
  ['src/components/NavigationDrawer.tsx', 'FINANCE_NAVIGATION.label', 'Owner Finance navigation'],
  ['src/modules/personal-expenses/PersonalExpensesPage.tsx', 'Personal Expenses', 'Personal Expenses module'],
  ['src/modules/costing/pages/Invoices/index.tsx', 'Invoice History', 'Supplier Invoices module'],
  ['src/components/SearchTab.tsx', 'Recipe', 'Recipe Library'],
  ['src/components/RecipeCostAnalysis.tsx', 'Selling Price', 'Recipe Cost Analysis summary'],
  ['src/components/RecipeCostAnalysis.tsx', 'useWorkspaceRegion', 'Recipe Cost Analysis workspace currency'],
  ['src/components/AddRecipeTab.tsx', 'calculateRecipeEditorCostPreview', 'Edit Recipe live costing'],
  ['src/components/AddRecipeTab.tsx', 'sellingPriceValue={sellingPrice}', 'Edit Recipe canonical Selling Price binding'],
  ['src/components/RecipeDetailModal.tsx', '<RecipeCostAnalysis recipe={recipe} />', 'Recipe Detail shared Cost Analysis'],
  ['src/modules/costing/services/recipeCostCalculator.ts', 'calculateRecipeCosting', 'shared Recipe costing calculator'],
  ['src/modules/store/StorePage.tsx', 'Store', 'Store module'],
  ['src/modules/store/HostProgramPage.tsx', 'Host', 'Host Group Order module'],
  ['src/modules/store/services/groupOrderService.ts', 'groupOrder', 'Host Group Order service'],
  ['src/modules/team/TeamPage.tsx', 'Team', 'Team module']
];

const missing = requiredSourceMarkers.flatMap(([filePath, marker, label]) => {
  try {
    return readRepositoryFile(filePath).includes(marker) ? [] : [`${label}: marker missing from ${filePath}`];
  } catch {
    return [`${label}: ${filePath} is missing`];
  }
});

const recipeEditorSource = readRepositoryFile('src/components/AddRecipeTab.tsx');
const recipeEditorOrder = [
  ['Cost Analysis', recipeEditorSource.indexOf('<RecipeCostAnalysis')],
  ['Ingredients', recipeEditorSource.indexOf('id="ingredients-section"')],
  ['Instructions', recipeEditorSource.indexOf('id="method-section"')],
  ['Story / Chef Notes', recipeEditorSource.indexOf('{/* Secondary narrative details */}')]
];
const recipeEditorOrderIsProtected = recipeEditorOrder.every(([, index]) => index >= 0)
  && recipeEditorOrder.every(([, index], position) => position === 0 || index > recipeEditorOrder[position - 1][1]);

if (!recipeEditorOrderIsProtected) {
  missing.push(
    `Recipe Edit Cost Analysis: expected ${recipeEditorOrder.map(([label]) => label).join(' -> ')} in src/components/AddRecipeTab.tsx`
  );
}

const sellingPriceBindingCount = recipeEditorSource.split('sellingPriceValue={sellingPrice}').length - 1;
if (sellingPriceBindingCount !== 1 || !recipeEditorSource.includes('{!isEditing && (')) {
  missing.push(
    'Recipe Edit Cost Analysis: Selling Price must have one canonical Edit binding inside Cost Analysis while the legacy field remains Add-only'
  );
}

if (missing.length > 0) {
  throw new Error(`Protected Beta module regression detected:\n- ${missing.join('\n- ')}`);
}

console.log(`Beta release baseline check passed: ${baseline.minimumCommit} -> ${candidateCommit}`);
console.log(`Protected modules present: ${baseline.protectedModules.join(', ')}`);
