import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getGeminiClient() {
  const apiKey = (process.env.GEMINI_API_KEY_NEXT || process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add GEMINI_API_KEY_NEXT or GEMINI_API_KEY to your Secrets panel in Settings.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const { messages, imageBase64, imagesBase64, currentConfig, currentAnalysis, hasClothingImage } = await req.json();

    const ai = getGeminiClient();

    // Prepare content parts for Gemini
    let contextText = `【当前系统上下文配置】
若有可用的参考商品或当前配置，请在此基础上进行润色、微调或生成。
- 此时系统内是否已有商品衣服底图: ${hasClothingImage ? '是 (已有衣服底图)' : '否 (暂无衣服底图)'}
`;
    if (currentAnalysis) {
      contextText += `- 当前商品信息:
  名称: ${currentAnalysis.productName || '未分析'}
  品类: ${currentAnalysis.category || '未分析'}
  风格: ${currentAnalysis.style || '未分析'}
  主色调: ${currentAnalysis.colors?.join(', ') || '未分析'}
  材质面料: ${currentAnalysis.materials || '未分析'}
  主要描述: ${currentAnalysis.description || '无'}
`;
    }
    if (currentConfig) {
      contextText += `- 当前生图配置:
  领口/剪裁: ${currentConfig.garmentCategory || '默认'}
  服装颜色: ${currentConfig.garmentColor || '默认'}
  面料纹理: ${currentConfig.garmentMaterial || '默认'}
  风格倾向: ${currentConfig.garmentStyle || '默认'}
  模特风格: ${currentConfig.modelStyle || '默认'}
  背景风格: ${currentConfig.sceneStyle || '默认'}
  画幅比例: ${currentConfig.aspectRatio || '3:4'}
  输出清晰度: ${currentConfig.resolution || '2k'}
`;
    }

    const contents: any[] = [];
    
    // Add context priming
    contents.push({
      role: 'user',
      parts: [{ text: contextText + "\n请务必阅读并记忆以上上下文。若用户接下来的对话涉及到对商品或背景的修改，请参考以上数据进行智能变更。" }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: "收到，我已经掌握了当前商品的特征与系统配置，将随时根据用户的对话来提供智能分析、微调参数、或触发各种画幅的高级电商图生成。请告诉我您想怎么处理这件商品？" }]
    });

    // Translate chat history to Gemini's format
    if (messages && messages.length > 0) {
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const msgParts: any[] = [];
        msgParts.push({ text: msg.content });

        // Translate images attached to this historical message
        if (msg.imageUrls && Array.isArray(msg.imageUrls) && msg.imageUrls.length > 0) {
          for (const imgStr of msg.imageUrls) {
            if (imgStr && imgStr.includes(',')) {
              const base64Data = imgStr.split(',')[1];
              const mimeType = imgStr.split(',')[0].split(':')[1].split(';')[0];
              msgParts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              });
            }
          }
        } else if (msg.imageUrl && msg.imageUrl.includes(',')) {
          const base64Data = msg.imageUrl.split(',')[1];
          const mimeType = msg.imageUrl.split(',')[0].split(':')[1].split(';')[0];
          msgParts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          });
        }

        // For the very last message, also support current turn payload if not already attached
        if (i === messages.length - 1 && role === 'user') {
          const alreadyHasImages = (msg.imageUrls && msg.imageUrls.length > 0) || msg.imageUrl;
          if (!alreadyHasImages) {
            if (imagesBase64 && Array.isArray(imagesBase64) && imagesBase64.length > 0) {
              for (const imgStr of imagesBase64) {
                if (imgStr && imgStr.includes(',')) {
                  const base64Data = imgStr.split(',')[1];
                  const mimeType = imgStr.split(',')[0].split(':')[1].split(';')[0];
                  msgParts.push({
                    inlineData: {
                      data: base64Data,
                      mimeType: mimeType
                    }
                  });
                }
              }
            } else if (imageBase64 && imageBase64.includes(',')) {
              const base64Data = imageBase64.split(',')[1];
              const mimeType = imageBase64.split(',')[0].split(':')[1].split(';')[0];
              msgParts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              });
            }
          }
        }

        contents.push({
          role,
          parts: msgParts
        });
      }
    }

    const systemInstruction = `你是一个顶级服装时尚买手、电商设计师和 AI 创意生图助理（FashionAI 助理）。你的任务是根据用户的提问 and 上传的商品图片，协助他们进行智能对话与生成。

【严禁自我重复与历史复制规则】：
- 在流式生成新一轮回复时，只输出针对当前最新用户问题的解答和对应ACTION。
- 绝不能大段复制、重复、或模仿历史对话中你或用户已经说过的内容（例如衣服的分析描述等）！
- 每一轮生成的 [REPLY] 必须是全新创作的、针对当前最新提问的针对性回复。

重要：你必须严格遵循【核心生图类型 type 的严格分类定义与生成逻辑】：
1. "main" (纯静物商品主图/白底图)：商品平铺挂拍，无任何模特或背景。
   - 一键直出：设置为 "directGenerate" 为 true。
2. "detail" (商品多角度材质细节详情图)：物理面料做工局部特写拼接。
   - 一键直出：设置为 "directGenerate" 为 true。
3. "sellingPoint" (大牌宣传卖点海报图)：商业海报画册，带英文文案或醒目排版。
   - 一键直出：设置为 "directGenerate" 为 true。
4. "scene" (真人模特上身场景图)：真人上身试穿效果，融合特定模特与环境。
   - 可配置/可直出规则：
     - 如果用户表达包含明确的“配置”、“选择”、“定制”、“上传”（如“定制真人模特场景图”、“我自己来选模特和背景”、“配置模特”），你必须开启配置流程：设置 "directGenerate" 为 false，在 [REPLY] 中热心地引导用户在下方的配置卡片中自行配置模特样式、画幅、细节、或上传背景。
     - 如果用户没有明确表达“配置/定制”（如“生成一张海滩欧美女模上身图”、“把背景换成咖啡馆”、“在沙漠中试穿这款衣服”），你必须立即开始智能渲染：设置 "directGenerate" 为 true。

动作类别 action 说明：
1. 'analyze_image': 用户刚刚上传了新衣服图片，想进行智能买手分析。
2. 'generate_smart': 智能渲染或试穿生图。
3. 'generate_custom': 自由大段描述的高级自定义模式。
4. 'update_config': 仅更新参数但不立即生图。
5. 'none': 普通闲聊。

【输出格式格式规范】：
每一次生成必须严格由 [REPLY] 和 [ACTION] 两个标记包裹，并且各占一行。
[REPLY]
(中文自然语言回复)

[ACTION]
(一个标准的、完全合法的、可解析的 JSON 格式块，不允许包含任何注释或额外的外部包装，必须包含以下字段)
{
  "action": "analyze_image" | "generate_smart" | "generate_custom" | "update_config" | "none",
  "actionExplanation": "动作中文解释",
  "detectedImageType": "clothing" | "model" | "scene" | "none",
  "directGenerate": true | false,
  "smartParams": {
    "type": "main" | "detail" | "sellingPoint" | "scene",
    "config": {
      "modelStyle": "例如：高阶立体模特/国风超模 或 欧美简约超模 等",
      "sceneStyle": "场景背景描述文字",
      "sceneTheme": "展示场景" | "自由生图" | "大牌宣传",
      "aspectRatio": "1:1" | "3:4" | "9:16",
      "resolution": "1k" | "2k" | "4k",
      "garmentColor": "服装颜色描述",
      "garmentMaterial": "材质面料描述"
    }
  }
}

示例：
如果用户说 “定制真人模特场景图”：
[REPLY]
没问题！已为您开启真人模特上身场景图的定制通道。您可以在下方互动卡片中自由选择心仪的模特特征、定制或上传背景、微调画幅比例等。配置完成后点击下方“智能生成场景大片”按钮即可开始画图！

[ACTION]
{
  "action": "generate_smart",
  "actionExplanation": "开启真人模特场景图定制",
  "detectedImageType": "none",
  "directGenerate": false,
  "smartParams": {
    "type": "scene",
    "config": {
      "modelStyle": "高阶立体模特/国风超模",
      "sceneStyle": "北欧极简暖雅原木家居，温和阳光柔和漫反射",
      "sceneTheme": "展示场景",
      "aspectRatio": "3:4",
      "resolution": "2k"
    }
  }
}
`;

    let responseStream;
    try {
      responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });
    } catch (err: any) {
      console.warn('Primary model gemini-2.5-flash failed, trying fallback gemini-3.1-flash-lite...', err);
      try {
        responseStream = await ai.models.generateContentStream({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          }
        });
      } catch (err2: any) {
        console.warn('Fallback gemini-3.1-flash-lite also failed, trying gemini-3.5-flash...', err2);
        responseStream = await ai.models.generateContentStream({
          model: 'gemini-3.5-flash',
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          }
        });
      }
    }

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch (err: any) {
          console.error('Error during content stream:', err);
          controller.enqueue(encoder.encode(`\n\n[ERROR]\n${err.message}`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
