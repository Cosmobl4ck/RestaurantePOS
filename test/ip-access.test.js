const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowed, isValidToken, normalizeIp } = require('../utils/ip-access');

test('los 3 primeros octetos equivalen a un /24', () => {
  assert.equal(isValidToken('190.85.12'), true);
  assert.equal(isValidToken('190.85.12.34'), true);
  assert.equal(isValidToken('190.85.12.0/24'), true);
  assert.equal(isValidToken('999.1.1'), false);
  assert.equal(isValidToken('190.85'), false);

  assert.equal(isAllowed('190.85.12.34', '190.85.12'), true);
  assert.equal(isAllowed('190.85.12.255', '190.85.12'), true);
  assert.equal(isAllowed('190.85.13.1', '190.85.12'), false);

  assert.equal(isAllowed('190.85.12.34', '190.85.12.34'), true);
  assert.equal(isAllowed('190.85.12.35', '190.85.12.34'), false);
  assert.equal(isAllowed('192.168.1.77', '192.168.1.0/24'), true);
});

test('sin IP configurada no restringe y normaliza IPv4 mapeada', () => {
  assert.equal(isAllowed('190.85.12.34', ''), true);
  assert.equal(isAllowed('190.85.12.34', null), true);
  assert.equal(normalizeIp('::ffff:190.85.12.34'), '190.85.12.34');
});
