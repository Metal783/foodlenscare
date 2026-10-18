import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analysisInput } from '../src/analysisInput.ts';
import { ALLERGENS } from '../src/legacy/data/allergens.js';
const result = analysisInput({ productName: '测试', ingredientText: '配料', photoDataUrl: 'private-photo', rawText: 'private-ocr', profile: { name: 'private-name' },
  nutritionCandidates: { sodium: { confidence: .9, conflict: true, warning: 'unit', boxes: ['private'], text: 'private-text' } } });
assert(!JSON.stringify(result).includes('private'));
assert.deepEqual(result.nutritionEvidence.sodium, { confidence: .9, conflict: true, warning: true });
assert.equal(analysisInput({ confidence: { sodium: .8 } }).nutritionEvidence.sodium.confidence, .8);
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('./assistant-allergens.json', import.meta.url))), ALLERGENS.map(({ id, label, short, aliases }) => ({ id, label, short, aliases })));
console.log('PASS food assistant whitelist and server allergen dictionary match existing local rules');
