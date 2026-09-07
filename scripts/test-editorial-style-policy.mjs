import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  READER_FRIENDLY_EDITORIAL_RULES,
  editorialReadabilityStats,
  rebalanceSectionsForReadability,
  splitLongParagraph
} from '../src/editorial-style.mjs';

for (const required of [
  'busy, intelligent colleague',
  'concrete situation',
  '1-3 sentences',
  'small work situations',
  'Never pretend to have personal experience',
  'smallest useful next action'
]) {
  assert.ok(READER_FRIENDLY_EDITORIAL_RULES.includes(required), `Missing reader-first rule: ${required}`);
}

const longParagraph = [
  '고객 문의가 여러 채널로 들어오면 담당자는 답변보다 먼저 내용을 모으는 데 시간을 쓰게 됩니다.',
  '이럴 때 자동화의 첫 목표는 모든 답변을 AI에게 맡기는 것이 아니라 문의를 한곳에 모으고 필요한 정보가 빠졌는지 확인하는 흐름을 만드는 것입니다.',
  '예를 들어 결제나 환불처럼 사람이 판단해야 하는 요청은 자동 분류까지만 하고 최종 답변은 담당자가 확인하도록 남겨 둘 수 있습니다.',
  '이렇게 경계를 정하면 속도는 높이면서도 잘못된 자동 응답이 고객 경험을 망칠 위험을 줄일 수 있습니다.'
].join(' ');

const split = splitLongParagraph(longParagraph, { targetChars: 120, maxChars: 150 });
assert.ok(split.length >= 2, 'Long readable prose should split at sentence boundaries.');
assert.equal(split.join(' ').replace(/\s+/g, ' '), longParagraph.replace(/\s+/g, ' '));
assert.ok(split.every((paragraph) => /[.!?]$/.test(paragraph)), 'Paragraph splitter must preserve complete sentences.');

const shortParagraph = '먼저 자동화할 일을 하나만 고르는 편이 좋습니다. 범위가 작아야 실패 원인을 찾기 쉽습니다.';
assert.deepEqual(splitLongParagraph(shortParagraph), [shortParagraph]);

const sections = [{
  heading: '고객 문의 자동화는 어디부터 시작할까',
  paragraphs: [longParagraph, longParagraph, longParagraph],
  bullets: ['문의 수집', '사람 검토', '자동 분류']
}];
const balanced = rebalanceSectionsForReadability(sections, { targetChars: 110, maxChars: 140 });
assert.equal(balanced.length, 1);
assert.ok(balanced[0].paragraphs.length <= 5, 'Section schema allows at most five paragraphs.');
assert.deepEqual(balanced[0].bullets, sections[0].bullets, 'Readability balancing must not rewrite checklist content.');

const stats = editorialReadabilityStats(balanced);
assert.ok(stats.paragraphCount >= 2);
assert.ok(stats.averageParagraphChars > 0);

const ollamaSource = await readFile(new URL('../src/ollama.mjs', import.meta.url), 'utf8');
assert.ok(ollamaSource.includes("from './editorial-style.mjs'"), 'Draft/QA wrapper must import the shared editorial style policy.');
assert.ok(ollamaSource.includes('const HUMAN_EDITORIAL_RULES = READER_FRIENDLY_EDITORIAL_RULES;'), 'Shared benchmark rules must replace ad-hoc prompt copy.');
assert.ok(ollamaSource.includes('Make revisedDescription work as a human lede as well as metadata'), 'QA must explicitly produce a reader-facing lede.');
assert.ok((ollamaSource.match(/rebalanceSectionsForReadability/g) || []).length >= 4, 'Draft, QA, and expansion paths must all use readability balancing.');
assert.ok(ollamaSource.includes('QA_EXPANSION_MAX_ROUNDS = 2'), 'Reader-friendly changes must not add extra slow model expansion rounds.');

console.log('reader-friendly editorial style policy tests passed');
