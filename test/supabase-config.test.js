const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('backend prefers the modern Supabase secret key and retains legacy compatibility', () => {
  const config = fs.readFileSync(path.join(root, 'config', 'supabase.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

  assert.match(config, /SUPABASE_SECRET_KEY \|\| SUPABASE_SERVICE_ROLE/);
  assert.match(server, /SUPABASE_SECRET_KEY \|\| process\.env\.SUPABASE_SERVICE_ROLE/);
  assert.match(example, /^SUPABASE_SECRET_KEY=$/m);
  assert.doesNotMatch(config, /createClient\(SUPABASE_URL, SUPABASE_SERVICE_ROLE,/);
});
