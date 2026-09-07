import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/publish.yml', 'utf8');

const installStart = workflow.indexOf('- name: Install Ollama');
const startStart = workflow.indexOf('- name: Start local Ollama');
if (installStart < 0 || startStart < 0 || startStart <= installStart) {
  throw new Error('publish.yml must contain ordered Install Ollama and Start local Ollama steps.');
}

const installBlock = workflow.slice(installStart, startStart);
const startBlock = workflow.slice(startStart, workflow.indexOf('- name: Discover, research, write, cross-check, and publish'));

const requiredInstallFragments = [
  'set -euo pipefail',
  '--retry 5',
  '--retry-all-errors',
  'https://ollama.com/install.sh',
  'https://github.com/ollama/ollama/releases/latest/download/install.sh',
  'https://github.com/ollama/ollama/releases/latest/download/ollama-linux-${arch}.tar.zst',
  'command -v ollama >/dev/null',
  'ollama --version'
];
for (const fragment of requiredInstallFragments) {
  if (!installBlock.includes(fragment)) throw new Error(`Install Ollama step is missing resilience guard: ${fragment}`);
}

if (/curl\s+-fsSL\s+https:\/\/ollama\.com\/install\.sh\s*\|\s*sh/.test(workflow)) {
  throw new Error('Do not use curl | sh for Ollama installation; an upstream curl failure can be hidden without pipefail.');
}

const requiredStartFragments = [
  'set -euo pipefail',
  'command -v ollama >/dev/null',
  'kill -0 "$ollama_pid"',
  'Ollama exited before becoming ready.',
  'Ollama did not become ready within 90 seconds.',
  'Ollama API is ready.'
];
for (const fragment of requiredStartFragments) {
  if (!startBlock.includes(fragment)) throw new Error(`Start local Ollama step is missing readiness guard: ${fragment}`);
}

console.log('Publish workflow policy OK: Ollama install retries, official GitHub fallbacks, binary verification, and bounded readiness checks are present.');
