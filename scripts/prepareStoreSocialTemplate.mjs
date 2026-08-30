import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(projectRoot, 'dist', 'index.html');
const outputDirectory = path.join(projectRoot, 'functions', 'generated');
const outputPath = path.join(outputDirectory, 'publicStoreAppShell.html');

const html = await readFile(sourcePath, 'utf8');
if (!/<head[\s>]/i.test(html) || !/<\/head>/i.test(html) || !/<div id="root"><\/div>/i.test(html)) {
  throw new Error('dist/index.html is not a valid MiseChef application shell. Run the Vite build first.');
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, html, 'utf8');
console.log(`Prepared Store social application shell: ${path.relative(projectRoot, outputPath)}`);
