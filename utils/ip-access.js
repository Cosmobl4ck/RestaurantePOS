const net = require('net');

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function parseAllowed(value) {
  return String(value || '')
    .split(',')
    .map((item) => normalizeIp(item))
    .filter(Boolean);
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}

function inIpv4Cidr(ip, cidr) {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!net.isIPv4(ip) || !net.isIPv4(base)) return false;
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isValidToken(value) {
  const token = normalizeIp(value);
  if (!token) return false;
  if (net.isIP(token)) return true;
  if (isIpv4Prefix3(token)) return true;
  if (!token.includes('/')) return false;
  const [base, bitsRaw] = token.split('/');
  const bits = Number(bitsRaw);
  return net.isIPv4(base) && Number.isInteger(bits) && bits >= 0 && bits <= 32;
}

function isIpv4Prefix3(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/**
 * Cloudflared suele conectar desde loopback o una red privada (Docker).
 * Solo en ese caso se acepta CF-Connecting-IP, y solo con TRUST_CLOUDFLARE=true.
 */
function isLocalOrPrivateIp(value) {
  const ip = normalizeIp(value);
  if (!net.isIP(ip)) return false;
  if (ip === '::1') return true;
  if (net.isIPv4(ip)) {
    return inIpv4Cidr(ip, '127.0.0.0/8')
      || inIpv4Cidr(ip, '10.0.0.0/8')
      || inIpv4Cidr(ip, '172.16.0.0/12')
      || inIpv4Cidr(ip, '192.168.0.0/16')
      || inIpv4Cidr(ip, '169.254.0.0/16');
  }
  const lower = ip.toLowerCase();
  return lower.startsWith('fc') || lower.startsWith('fd')
    || lower.startsWith('fe8') || lower.startsWith('fe9')
    || lower.startsWith('fea') || lower.startsWith('feb');
}

/**
 * IP real del cliente detrás de Cloudflare Tunnel.
 * El header CF-Connecting-IP solo se confía si el socket viene de cloudflared
 * (loopback/red privada) y TRUST_CLOUDFLARE=true. Nunca se confía en él desde
 * una conexión pública directa.
 */
function getClientIp(req) {
  const socketIp = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress);
  const rawHeader = typeof req?.get === 'function'
    ? req.get('cf-connecting-ip')
    : req?.headers?.['cf-connecting-ip'];
  const cfIp = normalizeIp(String(rawHeader || '').split(',')[0]);
  const trustsCloudflare = String(process.env.TRUST_CLOUDFLARE || '').toLowerCase() === 'true';

  if (trustsCloudflare && isLocalOrPrivateIp(socketIp) && net.isIP(cfIp)) {
    return cfIp;
  }
  return normalizeIp(req?.ip || socketIp);
}

/**
 * Sin IP configurada no se restringe. Acepta IPs exactas, los tres primeros
 * octetos (equivale a /24) o CIDR IPv4 separados por coma.
 */
function isAllowed(clientIp, allowedRaw) {
  const allowed = parseAllowed(allowedRaw);
  if (!allowed.length) return true;
  const ip = normalizeIp(clientIp);
  if (!ip) return false;

  return allowed.some((token) => {
    if (token === ip) return true;
    if (isIpv4Prefix3(token)) return inIpv4Cidr(ip, `${token}.0/24`);
    return token.includes('/') && inIpv4Cidr(ip, token);
  });
}

module.exports = { normalizeIp, parseAllowed, isValidToken, isAllowed, getClientIp };
