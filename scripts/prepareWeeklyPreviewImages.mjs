// Offline preparation only: reads local originals, never fetches or uploads data.
// Usage: node scripts/prepareWeeklyPreviewImages.mjs --source-dir /path/to/originals
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirIndex = process.argv.indexOf('--source-dir');
if (dirIndex < 0 || !process.argv[dirIndex + 1]) throw new Error('--source-dir is required.');
const sourceDir = path.resolve(process.argv[dirIndex + 1]);
const manifestPath = path.join(root, 'functions/weeklyPreviewImages.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const outputs = [];
for (const entry of manifest.entries) {
  const source = await readFile(path.join(sourceDir, entry.sourceFile));
  if (sha256(source) !== entry.sourceSha256 || source.length !== entry.sourceBytes) {
    throw new Error(`${entry.week}: source does not match the reviewed original.`);
  }
  const sourceInfo = await sharp(source).metadata();
  const swapAxes = sourceInfo.orientation >= 5;
  const sourceWidth = swapAxes ? sourceInfo.height : sourceInfo.width;
  const sourceHeight = swapAxes ? sourceInfo.width : sourceInfo.height;
  let output;
  for (const quality of [84, 76, 68, 60, 52]) {
    output = await sharp(source, { limitInputPixels: 20_000_000 }).rotate()
      .resize({ width: 960, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true }).toBuffer();
    if (output.length <= 280 * 1024) break;
  }
  if (output.length > 280 * 1024) throw new Error(`${entry.week}: JPEG exceeds the size budget.`);
  const info = await sharp(output).metadata();
  if (info.width < 300 || info.width / info.height > 4) throw new Error('Invalid WhatsApp dimensions.');
  const outputSha256 = sha256(output);
  Object.assign(entry, { assetPath: `/assets/weekly-menu-preview/${entry.week}-${outputSha256.slice(0, 20)}.jpg`,
    sourceWidth, sourceHeight, width: info.width, height: info.height, bytes: output.length, sha256: outputSha256 });
  outputs.push({ entry, output });
}
for (const { entry, output } of outputs) {
  const file = path.join(root, 'public', entry.assetPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, output);
  console.log(`${entry.week}: ${entry.bytes} bytes, ${entry.width}x${entry.height}`);
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
