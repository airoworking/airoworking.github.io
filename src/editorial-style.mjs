export const READER_FRIENDLY_EDITORIAL_RULES = `Reader-first editorial voice rules:
- Write for a busy, intelligent colleague, not for a classroom or a search engine. The reader should feel helped, not lectured.
- Sound warm, calm, practical, and confident without hype. Use everyday Korean where a simpler expression works. Explain unavoidable technical terms the first time they appear.
- Make the opening feel human. For a reader-facing description or lede, use two compact sentences when possible: first name a concrete situation, frustration, or decision the reader may recognize; then say what they will be able to decide, understand, or do after reading. Do not use fake empathy such as “모두가 겪는 문제입니다” or rhetorical questions that presume the reader’s feelings.
- Get to the answer quickly. In each section, lead with the useful point or recommendation, then explain why, trade-offs, setup details, or evidence. Avoid definition-first writing unless the definition is genuinely necessary.
- Keep paragraphs easy to scan: normally 1-3 sentences and one main idea per paragraph. Prefer several short substantive paragraphs over a dense wall of text. Vary sentence length naturally.
- Make abstract advice concrete. Across a full article, include small work situations, decision examples, or “예를 들어” explanations where they can be supported without inventing facts. Hypothetical examples must stay generic and must not invent prices, benchmarks, product behavior, quotes, or personal experience.
- Use bullets only when the reader is truly comparing 3+ items, following steps, or scanning a checklist. Do not turn normal explanation into a list just to look structured.
- Use transitions that reflect the reader’s decision flow: what matters first, what changes the choice, where people often get stuck, and what to try next. Do not repeat generic summaries at the end of every section.
- End with the smallest useful next action or decision, not a motivational slogan.
- Avoid formulaic AI prose, keyword stuffing, inflated claims, translated-product-copy rhythm, and repeated endings such as “~하는 것이 중요합니다”, “~할 수 있습니다”, or “효율성을 높이고 비용을 절감하며 성과를 향상시킵니다”.
- Titles and headings must sound like natural Korean editorial copy. Avoid templates such as “실전 활용 가이드”, “완벽 가이드”, or “효율적인 도입 전략 및 단계별 실행” unless the wording is genuinely necessary.
- Never put Markdown syntax such as **bold**, __bold__, backticks, or Markdown list markers inside JSON string fields.
- Never pretend to have personal experience. Keep every factual claim conservative and traceable to supplied evidence.`;

function sentenceChunks(value = '') {
  const text = String(value || '').trim();
  if (!text) return [];
  return text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((part) => part.trim()).filter(Boolean) || [text];
}

export function splitLongParagraph(value, { targetChars = 260, maxChars = 380 } = {}) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length <= maxChars) return text ? [text] : [];

  const sentences = sentenceChunks(text);
  if (sentences.length < 2) return [text];

  const out = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && candidate.length > targetChars) {
      out.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out.length ? out : [text];
}

function capParagraphCount(paragraphs, maxParagraphs = 5) {
  const clean = paragraphs.map((paragraph) => String(paragraph || '').trim()).filter(Boolean);
  if (clean.length <= maxParagraphs) return clean;
  return [
    ...clean.slice(0, maxParagraphs - 1),
    clean.slice(maxParagraphs - 1).join(' ')
  ];
}

export function rebalanceSectionsForReadability(sections, options = {}) {
  return (sections || []).map((section) => {
    const expanded = (section?.paragraphs || []).flatMap((paragraph) => splitLongParagraph(paragraph, options));
    return {
      ...section,
      paragraphs: capParagraphCount(expanded, 5),
      bullets: [...(section?.bullets || [])]
    };
  });
}

export function editorialReadabilityStats(sections) {
  const paragraphs = (sections || []).flatMap((section) => section?.paragraphs || []).map((value) => String(value || '').trim()).filter(Boolean);
  const lengths = paragraphs.map((paragraph) => paragraph.length);
  return {
    paragraphCount: paragraphs.length,
    averageParagraphChars: lengths.length ? Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length) : 0,
    maxParagraphChars: lengths.length ? Math.max(...lengths) : 0,
    longParagraphs: lengths.filter((length) => length > 420).length
  };
}
