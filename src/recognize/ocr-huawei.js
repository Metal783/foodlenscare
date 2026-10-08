/**
 * 兜底通道：华为云 OCR（通用表格识别 / 智能文档解析）
 *
 * 说明（方案 4.2）：营养标签本质是一张表格，用通用表格识别可拿到单元格级的
 * 行列结构，再配合本地解析器提取字段。当主通道置信度偏低或输出格式异常时启用。
 *
 * 实现状态：
 *  ✅ 请求构造 + 华为云 APIGW 签名（Web Crypto 实现，未依赖任何 SDK）
 *  ✅ 响应文本 → ParsedLabel 的本地解析（复用 parse-label.js）
 *  ⏳ 需要在 config.js 填入 AK/SK/endpoint 后才能真机联调
 *
 * ⚠️ 密钥安全：华为云 AK/SK 放在前端等于公开。正式部署请把本文件的
 *    请求改发到自建后端（config.huaweiOcr.uploadProxy），由后端持有密钥。
 */

import { CONFIG } from './config.js';
import { deriveSigningKey, sha256Hex, hmacSha256 } from './crypto-utils.js';
import { parseLabelText } from './parse-label.js';

/** 各接口的请求路径与响应字段位置 */
const API_TABLE = {
  'general-table': {
    path: '/v2/{project_id}/ocr/general-table',
    service: 'ocr',
    pick: (r) => pickTableText(r)
  },
  'smart-document': {
    path: '/v2/{project_id}/ocr/smart-document-recognizer',
    service: 'ocr',
    pick: (r) => pickSmartDocumentText(r)
  }
};

export function isConfigured() {
  const c = CONFIG.huaweiOcr;
  return Boolean(c.endpoint && c.ak && c.sk && c.projectId);
}

/**
 * 识别入口。
 * @param {{file:File|Blob, imageUrl?:string}} input
 * @returns {Promise<{label:import('../core/rules.js').ParsedLabel, channel:string, elapsedMs:number, raw:any}>}
 */
export async function recognize({ file, imageUrl }) {
  if (!isConfigured()) {
    const error = new Error('尚未配置华为云 OCR（src/recognize/config.js → huaweiOcr）。');
    error.code = 'E_NOT_CONFIGURED';
    throw error;
  }

  const started = performance.now();
  const url = imageUrl || (await uploadToObs(file));
  const api = API_TABLE[CONFIG.huaweiOcr.api] || API_TABLE['general-table'];

  const path = api.path.replace('{project_id}', CONFIG.huaweiOcr.projectId);
  const requestUrl = `${CONFIG.huaweiOcr.endpoint.replace(/\/$/, '')}${path}`;
  const body = JSON.stringify({ url, return_excel: false });

  const headers = await sign({
    method: 'POST',
    url: requestUrl,
    body,
    service: api.service
  });

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`华为云 OCR 返回 ${response.status}${text ? `：${text.slice(0, 120)}` : ''}`);
    error.code = 'E_HTTP';
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const rawText = api.pick(payload) || '';
  const label = parseLabelText(rawText, { channelLabel: channelTitle() });
  label.channel = 'ocr';
  label.channelLabel = channelTitle();
  label.rawText = rawText;

  return {
    label,
    channel: 'ocr',
    elapsedMs: Math.round(performance.now() - started),
    raw: payload
  };
}

function channelTitle() {
  return CONFIG.huaweiOcr.api === 'smart-document'
    ? '华为云 OCR 智能文档解析'
    : '华为云 OCR 通用表格识别';
}

/* -------------------------------------------------------------- 响应解析 */

/** 通用表格识别：result[].words 里是识别出的文字 */
function pickTableText(payload) {
  const result = payload?.result;
  if (!Array.isArray(result) || !result.length) return '';
  const table = result[0];
  const rows = table?.words ?? [];
  return rows.map((w) => w?.words ?? w?.value ?? '').filter(Boolean).join('\n');
}

/** 智能文档解析：返回 kv 对与纯文本 */
function pickSmartDocumentText(payload) {
  const parts = [];
  const result = payload?.result;
  if (!result) return '';
  if (Array.isArray(result?.kv_map)) {
    for (const item of result.kv_map) {
      if (item?.key) parts.push(`${item.key}：${item.value ?? ''}`);
    }
  }
  if (Array.isArray(result?.words_block_list)) {
    for (const block of result.words_block_list) {
      if (block?.words) parts.push(block.words);
    }
  }
  if (typeof result?.text === 'string') parts.push(result.text);
  return parts.join('\n');
}

/* ---------------------------------------------------------------- 签名 */

/**
 * 华为云 APIGW 签名（SDK-HMAC-SHA256）。
 * 参考华为云《API 签名认证》规范实现，未使用官方 SDK。
 * @param {{method:string,url:string,body:string,service:string}} input
 */
export async function sign({ method, url, body, service }) {
  const parsed = new URL(url);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260101T120000Z
  const shortDate = timestamp.slice(0, 8);

  const bodyHash = await sha256Hex(body || '');
  const headers = {
    host: parsed.host,
    'x-sdk-date': timestamp,
    'content-type': 'application/json'
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    parsed.pathname,
    parsed.search.replace(/^\?/, ''),
    canonicalHeaders,
    signedHeaders,
    bodyHash
  ].join('\n');

  const stringToSign = ['SDK-HMAC-SHA256', timestamp, await sha256Hex(canonicalRequest)].join('\n');
  const signingKey = await deriveSigningKey(CONFIG.huaweiOcr.sk, shortDate, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return {
    ...headers,
    'X-Sdk-Date': timestamp,
    Authorization: `SDK-HMAC-SHA256 Access=${CONFIG.huaweiOcr.ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function toHex(bytes) {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/* ------------------------------------------------------------ OBS 上传 */

/**
 * 华为云 OCR 的入参是图片 URL，因此需要先把照片上传到 OBS。
 * 这里给出两条路径：
 *  1. 配置了 uploadProxy → 交给自建后端（推荐，密钥不出后端）；
 *  2. 未配置 → 直接调用 OBS 直传接口（需要桶已开启公共读或使用临时授权）。
 * @param {File|Blob} file
 * @returns {Promise<string>} 可被 OCR 访问的图片 URL
 */
export async function uploadToObs(file) {
  if (CONFIG.huaweiOcr.uploadProxy) {
    const form = new FormData();
    form.append('file', file, 'label.jpg');
    const response = await fetch(CONFIG.huaweiOcr.uploadProxy, { method: 'POST', body: form });
    if (!response.ok) {
      const error = new Error('照片上传失败，请检查网络。');
      error.code = 'E_UPLOAD';
      throw error;
    }
    const data = await response.json();
    if (!data?.url) {
      const error = new Error('上传接口没有返回图片地址。');
      error.code = 'E_UPLOAD';
      throw error;
    }
    return data.url;
  }

  const error = new Error(
    '照片需要先上传到 OBS 才能调用华为云 OCR。请配置 huaweiOcr.uploadProxy（推荐）或改用主通道。'
  );
  error.code = 'E_UPLOAD_NOT_CONFIGURED';
  throw error;
}
