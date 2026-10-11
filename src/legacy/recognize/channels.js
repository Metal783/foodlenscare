/**
 * 识别通道适配层
 *
 * 方案 4.2 的双通道策略在这里落地：
 *  - 主通道：多模态大模型视觉理解（http.js，真实接口；mock.js，演示替代）
 *  - 兜底通道：华为云 OCR 通用表格识别 + 本地文本解析（ocr-huawei.js）
 *  - 离线通道：内置演示用例（demo.js），保证答辩现场断网也能走完闭环
 *
 * 所有通道统一输出 `ParsedLabel` 结构，规则层完全不感知通道差异。
 */

export const CHANNELS = {
  paddleOcr: {id:'paddleOcr',label:'PaddleOCR · 本机中文识别',short:'PaddleOCR',description:'按文字位置识别配料和营养表，数值核对后使用，照片不上传。',offline:true},
  demo: {
    id: 'demo',
    label: '内置演示用例',
    short: '演示',
    description: '不联网，直接用内置的标签数据，用于答辩现场断网兜底。',
    offline: true
  },
  mock: {
    id: 'mock',
    label: '模拟识别（演示用）',
    short: '模拟',
    description: '模拟多模态大模型返回，用于在拿到接口密钥前跑通整条闭环。',
    offline: true
  },
  http: {
    id: 'http',
    label: '真实多模态接口',
    short: '真接口',
    description: '把照片直接交给具备视觉能力的大模型，要求返回结构化字段与置信度。',
    offline: false
  },
  ocr: {
    id: 'ocr',
    label: '华为云 OCR 兜底通道',
    short: 'OCR',
    description: '表格识别拿到单元格文本，再用本地解析器提取字段。',
    offline: false
  }
};

export const CHANNEL_LIST = Object.values(CHANNELS);

/** 双通道互校验：两通道对同一字段取值不一致时，降低置信度并触发补拍 */
export const CROSS_CHECK_TOLERANCE = 0.25; // 相对偏差超过 25% 视为不一致
