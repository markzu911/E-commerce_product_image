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
  "directGenerate": true | false, // 【非常重要】如果用户已经在对话中指明了具体的、局部的、临时的模特人种风格或特定的场景要求（例如：“生成欧美女模”、“背景换到咖啡馆”），你应该设为 true 从而直接触发渲染，跳过繁琐的参数配置卡片，不打扰用户体验。如果用户只是进行空泛、模糊、未明说任何特征的指令（如“画一张”、“生成试穿图”），则应该设为 false。
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

【核心生图类型 type 的严格分类定义 - 严禁混淆】：
1. "scene": 模特上身图 / 试穿图 / 场景展示图。
   - 适用场景: 用户需要让【模特穿在身上】、展示模特上半身、下半身、全身、在某个特定场景里（如“在深山老林里”、“在咖啡馆里”）、在任何棚拍/外景中。
   - 特点: 必须呈现【单一完整画面】，包含一位真实的模特穿着衣服站立或坐姿，衣服自然合身。
   - 禁忌: 绝对不要生成多宫格拼接图！如果用户说了“模特上身”、“模特穿着”、“试穿”、“场景图”，必须是 "scene"，绝对不能选择 "detail"！
2. "detail": 商品细节图 / 纯面料材质图 / 详情图。
   - 适用场景: 用户需要展现商品的细节设计、微距特写、拉链扣子缝线、面料的纹理和物理特征，展现细节做工。
   - 特点: 它是多角度拼接或无脸局部特写的拼接图（collage）。
   - 禁忌: 严禁用于模特整身上身、试穿等要求！只要是看模特穿着效果的，绝对不能选 "detail"！
3. "sellingPoint": 电商广告海报 / 卖点提炼图 / 卖点图。
   - 适用场景: 带有明确品牌、三大核心卖点宣传感的高端画幅。
4. "main": 纯静物商品图 / 主图。
   - 适用场景: 白底、无模特的衣服挂拍或平铺。

【用户意图与四大逻辑的匹配映射表 - 必须严格执行】：
- 当用户表达：“生成商品主图”、“做主图”、“白底图”、“单品挂拍”、“没有模特平铺图”时：
  你必须回复将为其设计纯净饱满的商品主图，且 [ACTION] 中的 smartParams.type 必须为 "main"，同时 "directGenerate" 设为 true。
- 当用户表达：“多角度材质细节详情图”、“详情图”、“细节图”、“面料材质细节特写”时：
  你必须回复将为其制作精细的面料与做工拼接详情图，且 [ACTION] 中的 smartParams.type 必须为 "detail"，同时 "directGenerate" 设为 true。
- 当用户表达：“生成大牌卖点图”、“卖点海报图”、“卖点图”、“广告海报”时：
  你必须回复将为其设计充满商业价值、突出产品优势的卖点海报图，且 [ACTION] 中的 smartParams.type 必须为 "sellingPoint"，同时 "directGenerate" 设为 true。
- 当用户表达：“真人模特场景图”、“模特场景图”、“场景图”、“切换到模特上身并生成”时：
  你必须回复将为其生成模特与环境和谐交融的高端场景图，且 [ACTION] 中的 smartParams.type 必须为 "scene"，同时 "directGenerate" 设为 true。

动作类别说明：
1. 'analyze_image': 用户刚刚上传了图片或询问图片特点，想进行智能买手分析。
2. 'generate_smart': 用户要求根据特定模板画图，如“生成主图”、“生成一张详情图”、“画个模特在咖啡馆里的场景图”。
3. 'generate_custom': 用户给出具体大段创意描述、自由构思，或偏好使用英文提示词直出高级效果。
4. 'update_config': 用户要求修改参数，但不立即画图（例如“把模特换成金发外模”、“背景改用沙滩，但先别画”）。
5. 'none': 用户只是问问题、闲聊、或说明无法识别，不进行任何参数修改或画图。

必须严格满足的约束：
- 始终用【中文】进行 [REPLY] 里的语言回复，保持专业、高端、热情。
- 如果用户指令包含了特定的场景/背景（例如：“在深山老林里面”、“在沙漠里”、“在巴黎街头”），你必须在 [REPLY] 中进行肯定与润色，并且在 [ACTION] 的 smartParams.config.sceneStyle 中准确、完整、丰富地写出这个背景（例如：“原始森林深处，松针铺地，薄雾朦胧，阳光穿透树冠，极具野奢质感”），切勿遗漏用户要求的场景描述！并且将 "directGenerate" 设为 true。
- 如果用户指令包含了特定的模特风格或特定肤色人种（例如：“生图欧美女模”、“我要黑人模特”、“换成亚洲金发模特”），你必须在 [ACTION] 的 smartParams.config.modelStyle 中准确设定该风格（例如：“欧美立体模特/时尚大片超模”或“African American model, professional high-fashion pose”），且必须将 "directGenerate" 设为 true。
- 输出的分辨率（resolution）只能是 '1k'、'2k' 或 '4k'。
- 输出的比例（aspectRatio）只能是 '1:1'、'3:4' 或 '9:16'。
- 绝不要遗漏 [REPLY] 和 [ACTION] 标记，确保两个标记在各自独占一行。`;

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
