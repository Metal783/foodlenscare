/**
 * 接口配置
 *
 * 云接口默认留空 → 使用真实本机中文 OCR；首页内置用例可独立演示。
 * 拿到真实密钥后，只需填写本文件（或只改这一处），无需改动任何业务代码。
 *
 * ⚠️ 合规提醒：本文件会随前端一起下发到浏览器，任何填入的密钥都等于公开。
 *    正式部署时请把调用放在自己的服务端转发（把 `endpoint` 指向自己的转发地址），
 *    不要把云服务 AK/SK 直接写进前端。这一条建议同样适用于参赛材料的「合规说明」。
 */

export const CONFIG = {
  /** 默认启用本机中文 OCR，无需云端账号、密钥或图片上传。 */
  paddleOcr: { enabled: true },
  /** 主通道：多模态大模型视觉接口 */
  vision: {
    /**
     * 留空 = 尚未连接服务，不使用演示商品替代真实照片。
     * 可填任意兼容 OpenAI Chat Completions 的服务地址，例如：
     *   https://your-gateway.example.com/v1/chat/completions
     *   https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
     */
    endpoint: '',
    /** 形如 `Bearer sk-xxxx`；若走后端转发则由后端注入，这里留空 */
    authorization: '',
    model: 'qwen-vl-max-latest',
    /** 单次识别超时（毫秒） */
    timeoutMs: 30000,
    /** 是否要求模型返回 JSON 对象 */
    jsonMode: true
  },

  /** 兜底通道：华为云 OCR（通用表格识别 / 智能文档解析） */
  huaweiOcr: {
    endpoint: '',
    ak: '',
    sk: '',
    projectId: '',
    /** 'general-table' 通用表格识别 | 'smart-document' 智能文档解析 */
    api: 'general-table',
    timeoutMs: 30000,
    /**
     * 华为云 OCR 的图片入参是 URL（不是文件流），因此需要先把照片传到 OBS。
     * 走自建后端转发时，可直接把 OBS 上传与签名交给后端完成。
     */
    uploadProxy: ''
  },

  /** 接口不可用时的降级策略 */
  fallback: {
    /** 自动补拍的兜底：失败重试次数 */
    retry: 1
  }
};

/** 取结构化输出的提示词（真实接口与自检工具共用一份，便于记录到「AI 使用说明」） */
export const VISION_PROMPT = `你是食品包装标签识别助手。请只根据图片内容提取信息，不要推测、不要补全任何未印在包装上的内容。

请严格输出一个 JSON 对象，字段如下：
{
  "productName": "商品名称，原样抄录",
  "netContent": "净含量原文",
  "ingredientText": "配料表全文，保留原有顺序与标点",
  "allergenDeclaration": "包装上『致敏物质提示』『过敏原信息』原文，没有则空字符串",
  "nutritionPer100g": {
    "energy": 数值或 null,      // 千焦 kJ
    "protein": 数值或 null,     // 克 g
    "fat": 数值或 null,         // 克 g
    "saturatedFat": 数值或 null,// 克 g（GB 28050-2025 强制标示）
    "carbohydrate": 数值或 null,// 克 g
    "sugar": 数值或 null,       // 克 g（GB 28050-2025 强制标示）
    "sodium": 数值或 null       // 毫克 mg
  },
  "declaredPer": "per100g 或 perServing 或 unknown",
  "confidence": {
    "energy": 0-1 的小数, "protein": 0-1, "fat": 0-1, "saturatedFat": 0-1,
    "carbohydrate": 0-1, "sugar": 0-1, "sodium": 0-1
  },
  "unreadable": ["未能看清的字段名"]
}

要求：
1. 数值必须是数字类型，不要带单位、不要写字符串；看不清就填 null。
2. 如果营养成分表是按『每份』标示的，数值保持原样，并在 declaredPer 中标注 perServing。
3. confidence 表示你对每个字段的把握程度，看不清的字段请给出低于 0.7 的值。
4. 只输出 JSON，不要输出任何解释文字。`;
