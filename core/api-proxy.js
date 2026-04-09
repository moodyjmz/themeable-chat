// ─── Anthropic API proxy with retry and fallback ────────────────────────────

const https = require('https');

function callClaude(apiKey, model, maxTokens, system, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, max_tokens: maxTokens, system, messages });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text || '');
        } catch { reject(new Error('Parse error')); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function proxyToAnthropic(apiKey, fallbackModel, req, res) {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    };

    function attempt(retries, requestBody) {
      const proxy = https.request(options, r => {
        let data = '';
        r.on('data', d => data += d);
        r.on('end', () => {
          if (r.statusCode === 529 && retries > 0) {
            console.log(`Anthropic overloaded, retrying (${retries} left)...`);
            setTimeout(() => attempt(retries - 1, requestBody), 1000);
            return;
          }
          if (r.statusCode === 529 && fallbackModel) {
            console.log('Primary model unavailable, falling back to', fallbackModel);
            const parsed = JSON.parse(requestBody);
            parsed.model = fallbackModel;
            attempt(0, JSON.stringify(parsed));
            return;
          }
          if (r.statusCode !== 200) {
            console.error(`Anthropic API error [${r.statusCode}]:`, data);
          }
          res.writeHead(r.statusCode, { 'Content-Type': 'application/json' }).end(data);
        });
      });
      proxy.on('error', e => {
        console.error('Anthropic proxy connection error:', e.message);
        res.writeHead(500).end(e.message);
      });
      proxy.write(requestBody);
      proxy.end();
    }

    attempt(2, body);
  });
}

module.exports = { callClaude, proxyToAnthropic };
