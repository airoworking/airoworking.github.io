import http from 'node:http';
import { structuredResponse } from '../src/ollama.mjs';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
  required: ['ok', 'message']
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [] }));
    return;
  }
  if (req.url !== '/api/chat') {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    JSON.parse(body);
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        message: { content: JSON.stringify({ ok: true, message: 'delayed headers accepted' }) },
        eval_count: 4,
        total_duration: 1
      }));
    }, 700);
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
try {
  const result = await structuredResponse({
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: 'transport-test',
    schema,
    instructions: 'Return test data.',
    input: 'test',
    timeoutMs: 3000,
    maxOutputTokens: 20,
    contextWindow: 2048
  });
  if (!result.data.ok || result.data.message !== 'delayed headers accepted') {
    throw new Error('Unexpected structured response result.');
  }
  console.log('Ollama transport OK: delayed response headers are handled by the local HTTP transport.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
