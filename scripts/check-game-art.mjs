import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
if (mode !== 'check') throw new Error('Use check');
const manifest = JSON.parse(readFileSync(join(root, 'assets/pygem-manifest.json'), 'utf8'));
const relativeFiles = [];

for (const asset of manifest.assets) {
  if (asset.kind === 'font') continue; // Stage 3 does not change typography.
  if (!['card-background', 'noble-background', 'deck-background', 'gem-icon'].includes(asset.kind)) {
    throw new Error(`Unclassified game art: ${asset.path}`);
  }
  relativeFiles.push({ target: `public/pygem/${asset.path}`, sha256: asset.sha256 });
}
for (const asset of manifest.userAssets) {
  relativeFiles.push({ target: `public/custom-nobles/${asset.path}`, sha256: asset.sha256 });
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function checkExactCase(relativePath) {
  let directory = root;
  for (const segment of relativePath.split('/')) {
    if (!readdirSync(directory).includes(segment)) throw new Error(`Path case mismatch: ${relativePath}`);
    directory = join(directory, segment);
  }
}

for (const file of relativeFiles) {
  const targetPath = join(root, file.target);
  if (!existsSync(targetPath)) throw new Error(`Missing game art: ${file.target}`);
  checkExactCase(file.target);
  if (hash(targetPath) !== file.sha256) throw new Error(`Game art hash differs: ${file.target}`);
}

for (const directory of ['public/pygem/images', 'public/custom-nobles']) {
  const legacyFiles = readdirSync(join(root, directory)).filter(name => /\.png$/i.test(name));
  if (legacyFiles.length) throw new Error(`Uncompressed game art remains in ${directory}: ${legacyFiles.join(', ')}`);
}

const cardArt = Object.fromEntries(manifest.cards.map(({ id, image }) => [id, image]));
const nobleArt = Object.fromEntries(manifest.nobles.map(({ id, image }) => [id, image]));
const deckArt = Object.fromEntries(manifest.decks.map(({ tier, image }) => [tier, image]));
const gemArt = manifest.icons;
if (Object.keys(cardArt).length !== 90 || Object.keys(nobleArt).length !== 10 ||
    Object.keys(deckArt).length !== 3 || Object.keys(gemArt).length !== 6 ||
    Object.values({ ...cardArt, ...nobleArt, ...deckArt, ...gemArt }).some(path => !path)) {
  throw new Error('Incomplete mapping coverage');
}
const availablePaths = new Set(relativeFiles.map(file => `/${file.target.slice('public/'.length)}`));
for (const path of [...Object.values(cardArt), ...Object.values(nobleArt), ...Object.values(deckArt), ...Object.values(gemArt)]) {
  if (!availablePaths.has(path)) throw new Error(`Mapped image has no imported file: ${path}`);
}

const generated = `/** Generated from assets/pygem-manifest.json; verified by scripts/check-game-art.mjs. */\n` +
  `export const cardArt: Record<string, string> = ${JSON.stringify(cardArt, null, 2)};\n` +
  `export const nobleArt: Record<string, string> = ${JSON.stringify(nobleArt, null, 2)};\n` +
  `export const deckArt: Record<number, string> = ${JSON.stringify(deckArt, null, 2)};\n` +
  `export const gemArt: Record<string, string> = ${JSON.stringify(gemArt, null, 2)};\n`;
const generatedPath = join(root, 'src/components/gameArt.generated.ts');
if (!existsSync(generatedPath)) {
  throw new Error('Missing generated game art map');
} else if (readFileSync(generatedPath, 'utf8') !== generated) {
  throw new Error('Generated game art map differs; not overwriting existing file');
}

console.log(`Game art verified: ${relativeFiles.length} files; cards ${Object.keys(cardArt).length} ` +
  `(${manifest.summary.cardExact} exact, ${manifest.summary.cardFixedDecoration} fixed decoration), ` +
  `nobles ${Object.keys(nobleArt).length} (${manifest.summary.nobleExact} exact, ` +
  `${manifest.summary.nobleUserSupplied} user supplied), gems 6, decks 3.`);
