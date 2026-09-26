import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'assets/pygem-manifest.json'), 'utf8'));
const selections = [
  { id: '1-U-01', kind: 'card', source: 'public/pygem/images/blue1-1.png', target: 'public/sample-art/blue1-1.png' },
  { id: '1-W-08', kind: 'card', source: 'public/pygem/images/white1-2.png', target: 'public/sample-art/white1-2.png' },
  { id: 'N-06', kind: 'noble', source: 'public/custom-nobles/N-06.PNG', target: 'public/sample-art/N-06.PNG' },
  { id: 'blue', kind: 'icon', source: 'public/pygem/icons/sapphire-octagon-inline.svg', target: 'public/sample-art/sapphire-octagon-inline.svg' },
];

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

for (const selection of selections) {
  const { id, kind, source, target } = selection;
  const mapping = kind === 'card' ? manifest.cards.find(item => item.id === id)
    : kind === 'noble' ? manifest.nobles.find(item => item.id === id) : null;
  if (mapping && !mapping.image.endsWith(`/${source.split('/').at(-1)}`)) {
    throw new Error(`Manifest mapping changed for ${id}`);
  }
  if (kind === 'icon' && !manifest.icons.blue.endsWith(`/${source.split('/').at(-1)}`)) {
    throw new Error('Blue icon mapping changed');
  }
  const sourcePath = join(root, source);
  const targetPath = join(root, target);
  const sourceHash = hash(sourcePath);
  const assetEntry = kind === 'noble'
    ? manifest.userAssets.find(item => item.id === id)
    : manifest.assets.find(item => item.path === source.replace('public/pygem/', ''));
  if (!assetEntry || assetEntry.sha256 !== sourceHash) {
    throw new Error(`Source is missing from audited manifest or hash changed: ${source}`);
  }
  if (existsSync(targetPath)) {
    if (hash(targetPath) !== sourceHash) throw new Error(`Existing sample art differs: ${target}`);
    console.log(`verified ${target}`);
  } else {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    console.log(`copied ${target}`);
  }
}
