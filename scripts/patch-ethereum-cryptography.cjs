'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'ethereum-cryptography', 'esm', 'utils.js');
let content;
try {
  content = fs.readFileSync(file, 'utf8');
} catch {
  console.log('patch-ec: ethereum-cryptography/esm/utils.js not found, skipping');
  process.exit(0);
}

const broken = `import assert from "@noble/hashes/_assert";
import { hexToBytes as _hexToBytes } from "@noble/hashes/utils";
const assertBool = assert.bool;
const assertBytes = assert.bytes;`;

const fixed = `import { abytes as assertBytes } from "@noble/hashes/_assert";
import { hexToBytes as _hexToBytes } from "@noble/hashes/utils";
const assertBool = (b) => { if (typeof b !== "boolean") throw new Error("boolean expected"); };
const assert = { bool: assertBool, bytes: assertBytes };`;

if (content.includes('import assert from "@noble/hashes/_assert"')) {
  fs.writeFileSync(file, content.replace(broken, fixed));
  console.log('patch-ec: patched ethereum-cryptography/esm/utils.js');
} else {
  console.log('patch-ec: already patched or unexpected content, skipping');
}
