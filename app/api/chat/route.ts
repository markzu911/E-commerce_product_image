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
    const { messages, imageBase64, imagesBase64, currentConfig, currentAnalysis } = await req.json();

    const ai = getGeminiClient();

    // Prepare content parts for Gemini
    let contextText = `【当前系统上下文配置】
若有可用的参考商品或当前配置，请在此基础上进行润色、微调或生成。
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

        if (i === messages.length - 1 && role === 'user') {
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

        contents.push({
          role,
          parts: msgParts
        });
      }
    }

    const systemInstruction = `你是一个顶级服装时尚买手、电商设计师和 AI 创意生图助理（FashionAI 助理）。你的任务是根据用户的提问和上传的商品图片，协助他们进行智能对话与生成。

重要：你必须严格遵循以下指定的流式返回格式！你的输出必须包含两个部分，第一部分是用户的回复 [REPLY]，第二部分是触发的后台动作 [ACTION]。

输出格式如下：
[REPLY]
{这里填写你对用户的中文回复，说明你的时尚设计理念，解释接下来要触发的动作，流式输出时这部分会优先展示给用户}
[ACTION]
{这里填写一个 JSON 字符串，代表需要触发的生图或配置修改指令。如果没有任何动作，action 填 "none"}

[ACTION] 后面的 JSON 格式结构如下：
{
  "action": "generate_smart" | "generate_custom" | "update_config" | "analyze_image" | "none",
  "actionExplanation": "动作说明，比如 '正在为您生成温暖法式庄园毛衣主图'",
  "smartParams": {
    "type": "main" | "detail" | "sellingPoint" | "scene",
    "config": {
      "garmentCategory": "领口/剪裁",
      "garmentColor": "服装颜色",
      "garmentMaterial": "面料纹理",
      "garmentStyle": "风格倾向",
      "modelStyle": "模特风格",
      "sceneStyle": "背景风格",
      "sellingPoint1": "卖点1",
      "sellingPoint2": "卖点2",
      "sellingPoint3": "卖点3",
      "brandName": "品牌名称",
      "sceneTheme": "场景主题",
      "resolution": "1k" | "2k" | "4k",
      "aspectRatio": "1:1" | "3:4" | "9:16"
    }
  },
  "customParams": {
    "prompt": "润色、翻译并优化的【英文高质量创意提示词】。提示词要极具艺术和真实广告质感，比如：'Editorial fashion photo, oversize knit sweater, detailed fabric fibers, rustic wooden table, cinematic window shadow play, luxury warm color tone, hyper-realistic, 8k resolution'",
    "resolution": "1k" | "2k" | "4k",
    "aspectRatio": "1:1" | "3:4" | "9:16"
  },
  "configParams": {
    "config": {
      "garmentCategory": "领口/剪裁",
      "garmentColor": "服装颜色",
      "garmentMaterial": "面料纹理",
      "garmentStyle": "风格倾向",
      "modelStyle": "模特风格",
      "sceneStyle": "背景风格",
      "sellingPoint1": "卖点1",
      "sellingPoint2": "卖点2",
      "sellingPoint3": "卖点3",
      "brandName": "品牌名称",
      "sceneTheme": "场景主题",
      "resolution": "1k" | "2k" | "4k",
      "aspectRatio": "1:1" | "3:4" | "9:16"
    }
  }
}

动作类别说明：
1. 'analyze_image': 用户刚刚上传了图片或询问图片特点，想进行智能买手分析。
2. 'generate_smart': 用户要求根据特定模板画图，如“生成主图”、“生成一张详情图”、“画个模特在咖啡馆里的场景图”。
3. 'generate_custom': 用户给出具体大段创意描述、自由构思，或偏好使用英文提示词直出高级效果。
4. 'update_config': 用户要求修改参数，但不立即画图（例如“把模特换成金发外模”、“背景改用沙滩，但先别画”）。
5. 'none': 用户只是问问题、闲聊、或说明无法识别，不进行任何参数修改或画图。

必须严格满足的约束：
- 始终用【中文】进行 [REPLY] 里的语言回复，保持专业、高端、热情。
- 输出的分辨率（resolution）只能是 '1k'、'2k' 或 '4k'。
- 输出的比例（aspectRatio）只能是 '1:1'、'3:4' 或 '9:16'。
- 绝不要遗漏 [REPLY] 和 [ACTION] 标记，确保两个标记在各自独占一行。`;

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

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
