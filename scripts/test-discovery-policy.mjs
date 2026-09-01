import { readFile } from 'node:fs/promises';
import { buildDiscoveryQueries } from '../src/research.mjs';

const config = JSON.parse(await readFile(new URL('../config/blog.config.json', import.meta.url), 'utf8'));
const queries = buildDiscoveryQueries(config.research, '2026-08-27');
if (queries.length !== config.research.discoveryQueryCount) throw new Error(`Expected ${config.research.discoveryQueryCount} discovery queries, got ${queries.length}.`);
if (new Set(queries).size !== queries.length) throw new Error('Discovery queries must be unique.');
const represented = config.research.audienceSegments.filter((segment) => queries.some((query) => query.includes(segment.searchPhrase)));
if (represented.length < 4) throw new Error(`Discovery must cover at least four audience segments per run; got ${represented.map((segment) => segment.id).join(', ') || 'none'}.`);
const hasBroadWorkProblem = queries.some((query) => /email|document|spreadsheet|meeting|customer|content|client|booking|task|calendar/i.test(query));
if (!hasBroadWorkProblem) throw new Error('Discovery queries must include a non-developer work/business problem.');
console.log(`Discovery policy OK: ${queries.length} unique queries across ${represented.length} audience segments.`);
