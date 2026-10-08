/**
 * 浏览器端密码学小工具（Web Crypto 封装）
 *
 * 仅在调用华为云 OCR 兜底通道、需要按 APIGW 规范做请求签名时使用。
 * 主通道（多模态接口）不需要签名。
 */

const encoder = new TextEncoder();

/** @param {string|ArrayBuffer|Uint8Array} data */
function toBytes(data) {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

/** SHA-256 → 小写十六进制 */
export async function sha256Hex(data) {
  const digest = await crypto.subtle.digest('SHA-256', toBytes(data));
  return toHex(new Uint8Array(digest));
}

/** HMAC-SHA256 → 原始字节 */
export async function hmacSha256(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBytes(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, toBytes(message));
  return new Uint8Array(signature);
}

/** HMAC-SHA256 → 小写十六进制 */
export async function hmacSha256Hex(key, message) {
  return toHex(await hmacSha256(key, message));
}

function toHex(bytes) {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * 华为云 APIGW 派生签名密钥：
 * kDate = HMAC("SDK" + SK, YYYYMMDD)
 * kService = HMAC(kDate, service)
 * kSigning = HMAC(kService, "sdk_request")
 */
export async function deriveSigningKey(secretKey, shortDate, service = 'ocr') {
  const kDate = await hmacSha256(`SDK${secretKey}`, shortDate);
  const kService = await hmacSha256(kDate, service);
  return hmacSha256(kService, 'sdk_request');
}
