import { __ollamaDepthTest } from '../src/ollama.mjs';

const { paragraphChars, promoteUsefulBulletsToParagraphs, mergeExpandedSections } = __ollamaDepthTest;

const current = Array.from({ length: 5 }, (_, sectionIndex) => ({
  heading: `현재 섹션 ${sectionIndex + 1}`,
  paragraphs: Array.from({ length: 5 }, (_, paragraphIndex) =>
    `현재 검증 문단 ${sectionIndex + 1}-${paragraphIndex + 1}. 자동화 범위를 정할 때 입력과 출력, 담당자와 예외 조건을 먼저 확인해야 한다는 핵심 내용을 짧게 정리합니다.`),
  bullets: []
}));

const expanded = Array.from({ length: 5 }, (_, sectionIndex) => ({
  heading: `현재 섹션 ${sectionIndex + 1}`,
  paragraphs: Array.from({ length: 3 }, (_, paragraphIndex) =>
    `확장 문단 ${sectionIndex + 1}-${paragraphIndex + 1}. 검증된 범위 안에서 실제 적용 순서를 더 자세히 설명합니다. 먼저 시작 조건과 완료 조건을 적고 사람이 판단해야 하는 예외를 따로 표시하면 자동화 범위를 과도하게 넓히는 실수를 줄일 수 있습니다. 작은 범위로 시험한 뒤 누락과 오류를 확인하고 다음 단계로 확장하는 방식이 유지 관리에도 유리합니다.`),
  bullets: []
}));

const before = paragraphChars(current);
if (before >= 3500) throw new Error(`Fixture must begin below the final gate, got ${before}.`);
if (current.some((section) => section.paragraphs.length !== 5)) throw new Error('Fixture must occupy all five paragraph slots.');

const merged = mergeExpandedSections(current, expanded);
const after = paragraphChars(merged);
if (after <= before) throw new Error(`Expansion text was discarded at the paragraph cap: ${before} -> ${after}.`);
if (after < 3500) throw new Error(`Expansion merge did not preserve enough substantive prose: ${after}.`);
if (merged.some((section) => section.paragraphs.length > 5)) throw new Error('Expansion merge exceeded the schema paragraph cap.');

const bulletSections = Array.from({ length: 5 }, (_, sectionIndex) => ({
  heading: `불릿 섹션 ${sectionIndex + 1}`,
  paragraphs: Array.from({ length: 5 }, (_, paragraphIndex) =>
    `짧은 본문 ${sectionIndex + 1}-${paragraphIndex + 1}. 확인된 판단 기준을 간결하게 설명합니다.`),
  bullets: [
    `실제 적용에서는 현재 업무의 입력과 출력, 담당자, 예외 상황을 먼저 적어 두면 자동화 도구를 고르기 전에 무엇을 바꿔야 하는지가 보입니다. 사람이 확인해야 할 지점과 자동으로 처리해도 되는 지점을 분리해서 작은 범위부터 검증하는 편이 안전합니다.`,
    `운영 과정에서는 실패했을 때 되돌리는 방법과 수동 확인 지점을 함께 정해 두어야 합니다. 자동화가 정상적으로 동작하는지만 보는 것이 아니라 누락과 중복이 생겼을 때 누가 확인하고 어떻게 복구할지도 정해야 합니다.`
  ]
}));

const bulletBefore = paragraphChars(bulletSections);
const promoted = promoteUsefulBulletsToParagraphs(bulletSections, 3500);
const bulletAfter = paragraphChars(promoted);
if (bulletAfter <= bulletBefore) throw new Error(`Substantive bullets were discarded at the paragraph cap: ${bulletBefore} -> ${bulletAfter}.`);
if (promoted.some((section) => section.paragraphs.length > 5)) throw new Error('Bullet promotion exceeded the schema paragraph cap.');

console.log(`QA paragraph-cap merge OK: expansion ${before} -> ${after}; bullet folding ${bulletBefore} -> ${bulletAfter}; max 5 paragraphs preserved.`);
