import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'packages/contracts/src/abis');
const OUT = path.join(__dirname, '../abis');

const FILES = [
  'A7A5.json',
  'WA7A5.json',
  'ParaSwap.json',
  'PoolsFacade.json',
];

function main() {
  fs.mkdirSync(OUT, {recursive: true});
  for (const file of FILES) {
    const from = path.join(SRC, file);
    const to = path.join(OUT, file);
    if (!fs.existsSync(from)) {
      console.warn(`[sync-abis] skip ${file}: run npm run build:contracts first`);
      continue;
    }
    fs.copyFileSync(from, to);
    console.log(`[sync-abis] ${file}`);
  }
}

main();
