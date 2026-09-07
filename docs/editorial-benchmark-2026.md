# Reader-friendly editorial benchmark (2026-09)

This document records the editorial patterns used to shape the publication voice for **AI로 일하는 법**. It is a synthesis, not a style imitation guide: we borrow general reader-experience principles and do not copy any publisher's distinctive wording or voice.

## Why these publishers

The benchmark mixes high-traffic business/marketing publishers with large technology and consumer-guide publications. Recent third-party traffic estimates and category rankings were checked in September 2026 so the sample is biased toward publications that already earn substantial readership rather than small writing-advice blogs.

| Publication | Recent scale signal checked | Reader-experience pattern worth learning |
| --- | --- | --- |
| Shopify | Semrush: ~392.31M visits in Jul 2026; Similarweb #2 in Business Services | Treat the reader as smart but new to the topic; conversational, purposeful, web-first formatting; make the reason to read obvious early. |
| Forbes / Forbes Advisor | Semrush: ~71.97M visits in Jul 2026 | Put the user's decision first; separate evidence and commercial incentives; explain methodology and next steps clearly. |
| HubSpot | Semrush: ~49.69M visits in Jun 2026; Similarweb #3 in Digital Marketing | High-performing posts use short paragraphs, bullets where useful, scannable sections, and visual breaks. |
| Semrush | Semrush: ~42.04M visits in Jun 2026; Similarweb top digital-marketing site | Strong hook, direct answer at the start of sections, 2-3 sentence paragraphs, examples, plain language, clear CTA. |
| Ahrefs | Semrush: ~29.65M visits in Jul 2026 | Get to the point, match search intent, use a strong angle, make long guides easy to scan, and prefer useful specificity over generic completeness. |
| NerdWallet | Semrush: ~24.41M visits in Jul 2026 | Translate complicated choices into clear next steps; reader-first framing, confidence without jargon, fact-checking and transparent trade-offs. |
| Tom's Guide | Semrush: ~16.62M visits in Jun 2026 | Answer “is this good, and for whom?”; comparisons revolve around fit, alternatives, and concrete use cases. |
| WIRED | Semrush: ~14.03M visits in Jun 2026 | Use a vivid real-world observation or scene to pull the reader into a technical topic before expanding into explanation. |
| TechCrunch | Semrush: ~11.23M visits in Jun 2026 | Lead with the consequential point, use concrete examples and plain comparisons, and maintain narrative momentum even in technical/business reporting. |
| The Verge | Semrush: ~10.58M visits in Jul 2026 | Use concise framing, a clear point of view/angle, relatable tech context, and short explanatory blocks. |
| Buffer | Semrush: ~4.39M visits in Jun 2026 | Voice should be relatable, approachable, genuine, inclusive, and informed without sounding certain about everything; empathy changes tone by context. |
| Zapier | Large long-running productivity/automation publication; current blog spans app tips, best-app guides, productivity, business, and automation | Introductions work well as opener → problem → solution → expectation; practical examples and role-specific use cases make abstract automation feel achievable. |

Traffic is only a screening signal. It does **not** prove that a specific writing technique caused traffic. The editorial rules below are based on patterns repeatedly visible across these publishers and on their own published style/editorial guidance where available.

## Sources reviewed

- Similarweb Digital Marketing ranking: https://www.similarweb.com/top-websites/business-and-consumer-services/online-marketing/
- Similarweb Business Services ranking: https://www.similarweb.com/top-websites/business-and-consumer-services/business-services/
- Semrush domain traffic pages for Shopify, Forbes, HubSpot, Semrush, Ahrefs, NerdWallet, Tom's Guide, WIRED, TechCrunch, The Verge, and Buffer.
- HubSpot, “What HubSpot's Highest Performing Blog Posts Have in Common”.
- Zapier, “How to write a good blog introduction” and current Zapier Blog / contributor guidelines.
- Buffer company-wide content style guide and social-media style guide.
- Ahrefs, “How to Format a Blog Post” and “How to Write a Blog Post”.
- Shopify contributor guidelines and current content-writing/blog-design guides.
- Semrush, “How to Write an SEO Blog Post” and “How to Write an Article Audiences Want to Read”.
- NerdWallet editorial guidelines and editorial-team pages.
- Forbes Advisor editorial policies.
- Tom's Guide testing/review methodology.
- Current WIRED, The Verge, and TechCrunch technology/productivity articles reviewed for opening and section rhythm.

## Distilled house style for AI로 일하는 법

### 1. Write to a busy colleague

The reader is intelligent but may be new to the exact tool or workflow. Explain unfamiliar terms once, then move on. Never sound like a textbook, a product manual, or a lecturer.

### 2. Human opening before information density

The first reader-facing copy should quickly do four jobs:

1. name a concrete work situation, frustration, or decision;
2. make clear why it matters;
3. indicate the useful direction or answer;
4. tell the reader what they will be able to decide or do after reading.

Avoid fake familiarity (“다들 이런 경험 있으시죠?”), manufactured anxiety, or empty trend statements.

### 3. Direct answer first, explanation second

A section should normally open with the useful answer or recommendation. Follow with reasoning, constraints, evidence, an example, or a trade-off. Definition-first sections are reserved for terms the reader genuinely needs defined.

### 4. One idea per paragraph

Most paragraphs should be 1-3 sentences. Long paragraphs are split locally after generation when sentence boundaries make that safe. Short does not mean shallow: depth comes from multiple focused paragraphs, not one wall of text.

### 5. Use micro-scenarios, not fake experience

Concrete examples help readers recognize themselves in a workflow. Use generic hypothetical situations such as a small team handling customer follow-ups, a freelancer preparing proposals, or a knowledge worker consolidating meeting notes. Never fabricate personal experience, prices, benchmarks, quotes, or product behavior.

### 6. Lists must earn their place

Use bullets for true comparison sets, checklists, or steps. Ordinary explanation stays in prose. Avoid articles that feel like a database dump or a sequence of numbered facts.

### 7. Preserve trade-offs

Friendly writing is not promotional writing. State when a tool is a poor fit, when manual review is still necessary, and what changes the decision.

### 8. End with the next smallest useful action

The conclusion should leave the reader with a concrete next step or decision. Avoid generic motivation, repeated summaries, and “AI will transform the future” endings.

## Implementation notes

- `src/editorial-style.mjs` contains the shared reader-first model instructions and deterministic paragraph balancing.
- Draft and QA model calls use the same house voice; no extra model call is added.
- QA output is locally rebalanced so unusually long generated paragraphs do not become walls of text.
- Regression tests verify the rules stay connected to the model pipeline and that long paragraphs are split without violating the five-paragraph-per-section schema limit.
