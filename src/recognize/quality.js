/**
 * 图像质量检测（模糊 / 过暗 / 过曝 / 分辨率 / 文字占比）
 *
 * 目的：为灰色等级提供客观的「硬性原因」。方案 4.3 规定，
 * 图片模糊、营养成分表缺失或字段置信度不足时，系统应请用户补拍，
 * 而不是强行给出结论。本模块只做客观测量，不做任何健康判断。
 *
 * 实现说明：使用缩略图上的灰度拉普拉斯方差（Tenengrad 思路的简化版）
 * 作为清晰度指标，阈值取经验值，仅用于演示级判定。
 */

const THUMB_WIDTH = 320;

/** 经验阈值：拉普拉斯方差低于该值视为模糊 */
export const BLUR_THRESHOLD = 60;
/** 平均亮度低于该值视为过暗 */
export const DARK_THRESHOLD = 55;
/** 极暗像素占比高于该值视为过暗 */
export const DARK_RATIO_THRESHOLD = 0.45;
/** 极亮像素占比高于该值视为过曝（反光） */
export const BRIGHT_RATIO_THRESHOLD = 0.22;

/**
 * @typedef {Object} ImageQuality
 * @property {boolean} blurry
 * @property {boolean} tooDark
 * @property {boolean} tooBright
 * @property {boolean} tooSmall 分辨率不足
 * @property {number} sharpness 拉普拉斯方差
 * @property {number} brightness 平均亮度 0—255
 * @property {number} width
 * @property {number} height
 * @property {number} megapixels
 * @property {string[]} tips 面向用户的补拍建议（口语化）
 */

/**
 * 测量图片质量。
 * @param {HTMLImageElement|ImageBitmap} image
 * @returns {ImageQuality}
 */
export function measureImage(image) {
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;
  const megapixels = (width * height) / 1e6;

  const empty = {
    blurry: false,
    tooDark: false,
    tooBright: false,
    tooSmall: width > 0 && width < 480,
    sharpness: 0,
    brightness: 0,
    width,
    height,
    megapixels: Math.round(megapixels * 10) / 10,
    tips: []
  };

  if (!width || !height) {
    return { ...empty, blurry: true, tips: ['这张图片读不出内容，请重新拍一张。'] };
  }

  const scale = Math.min(1, THUMB_WIDTH / width);
  const w = Math.max(16, Math.round(width * scale));
  const h = Math.max(16, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    // 无法取样时不阻断流程，交给识别层置信度判断
    return empty;
  }

  let pixels;
  try {
    ctx.drawImage(image, 0, 0, w, h);
    pixels = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return empty;
  }

  const gray = new Float32Array(w * h);
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[p] = y;
    sum += y;
    if (y < 45) dark += 1;
    if (y > 235) bright += 1;
  }
  const brightness = sum / gray.length;

  // 拉普拉斯方差
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      const lap =
        4 * gray[p] -
        gray[p - 1] -
        gray[p + 1] -
        gray[p - w] -
        gray[p + w];
      lapSum += lap;
      lapSqSum += lap * lap;
      count += 1;
    }
  }
  const mean = count ? lapSum / count : 0;
  const variance = count ? lapSqSum / count - mean * mean : 0;

  const tooDark = brightness < DARK_THRESHOLD || dark / gray.length > DARK_RATIO_THRESHOLD;
  const tooBright = bright / gray.length > BRIGHT_RATIO_THRESHOLD;
  const blurry = variance < BLUR_THRESHOLD;
  const tooSmall = width < 480 || height < 480;

  const tips = [];
  if (blurry) tips.push('手机端稳一点，等画面清楚再按快门。');
  if (tooDark) tips.push('这边光线有点暗，换到亮一点的地方。');
  if (tooBright) tips.push('有反光，稍微斜一点拿包装，避开灯光直射。');
  if (tooSmall) tips.push('把手机再靠近包装一点，让字占满画面。');
  if (!tips.length) tips.push('照片很清楚。');

  return {
    blurry,
    tooDark,
    tooBright,
    tooSmall,
    sharpness: Math.round(variance),
    brightness: Math.round(brightness),
    width,
    height,
    megapixels: Math.round(megapixels * 10) / 10,
    tips
  };
}

/**
 * 从 File / Blob 加载为 HTMLImageElement。
 * 使用 objectURL，避免把照片转成 base64 占用内存（老年人手机内存有限）。
 * @param {Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('这张图片无法打开，换一张试试。'));
    };
    img.src = url;
  });
}

/**
 * 读取尺寸信息（不需要解码全部像素时使用）。
 * @param {Blob} file
 */
export function readDimensions(file) {
  return loadImage(file).then((img) => ({
    width: img.naturalWidth,
    height: img.naturalHeight,
    mm: img
  }));
}
