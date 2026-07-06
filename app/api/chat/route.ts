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

    const systemInstruction = `你是一个顶级服装时尚买手、电商设计师和 AI 创意生图助理（FashionAI 助理）。你的任务是根据用户的提问 and 上传的商品图片，协助他们进行智能对话与生成。

重要：你必须严格遵循【核心生图类型 type 的严格分类定义与生成逻辑】：
1. "main" (纯静物商品主图/白底图)：商品平铺挂拍，无任何模特或背景。
   - **一键直出规则**：无论用户说“生成商品主图”、“做主图”、“白底图”、“单品挂拍”还是带有“定制商品主图”等字样，你**必须一律一键直接渲染生成**，设置 "directGenerate" 为 true。
2. "detail" (商品多角度材质细节详情图)：物理面料做工局部特写拼接。
   - **一键直出规则**：无论用户说“多角度材质细节详情图”、“详情图”、“细节图”还是带有“定制多角度材质细节详情图”等字样，一律**一键直接渲染生成**，设置 "directGenerate" 为 true。
3. "sellingPoint" (大牌宣传卖点海报图)：商业海报画册，带英文文案或醒目排版。
   - **一键直出规则**：无论用户说“生成大牌卖点图”、“卖点海报图”、“卖点图”、“广告海报”还是带有“定制大牌卖点图”等字样，一律**一键直接渲染生成**，设置 "directGenerate" 为 true。
4. "scene" (真人模特上身场景图)：真人上身试穿效果，融合特定模特与环境。
   - **可配置/可直出规则**：
     - 如果用户表达包含明确的“配置”、“选择”、“定制”（如“定制真人模特场景图”、“我自己来选模特和背景”），你必须开启配置流程，设置 "directGenerate" 为 false，在 [REPLY] 中引导用户在下方的配置卡片中自行配置模特或上传背景。
     - 如果用户没有明确表达“配置/定制”（如“生成一张海滩欧美女模上身图”、“把背景换成咖啡馆”、“在沙漠中试穿这款衣服”），你必须立即开始智能渲染，设置 "directGenerate" 为 true。

【图片上传与自动响应映射】：
- 用户新上传了图片：
  1. 上传的是模特人像（"model"） or 背景场景（"scene"）图：
     - 如果系统目前已有服装单品底图（当前上下文配置中已有图片），则你必须立即自动触发模特上身融合，设置 "action" 为 "generate_smart"，type 设为 "scene"，且 "directGenerate" 设为 true。
     - 如果系统目前没有任何衣服底图，则你在 [REPLY] 中引导用户上传服装底图（设置 "action" 为 "none"，"directGenerate" 为 false）。
  2. 上传的是衣服/商品单品原图（"clothing"）：
     - 你需要设置 "action" 为 "analyze_image"，并在 [REPLY] 中进行时尚买手卖点、面料与做工细节的专业分析，热心推荐下一步生成商品主图、详情图、卖点图或模特场景图。

动作类别 action 说明：
1. 'analyze_image': 用户刚刚上传了图片 or 询问图片特点，想进行智能买手分析。
2. 'generate_smart': 根据特定的类型（main, detail, sellingPoint, scene）渲染或试穿生图。
3. 'generate_custom': 自由大段创意或英文 prompt 描述的高级自定义模式。
4. 'update_config': 仅更新参数但不立即画图（如“把模特换成金发外模，先别画”）。
5. 'none': 普通闲聊、问答 or 等待上传衣服。

必须严格满足的约束：
- 始终用【中文】进行 [REPLY] 里的语言回复，保持专业、高端、热情。
- 如果用户指令包含了特定的场景/背景（例如：“在深山老林里面”、“在沙漠里”、“在巴黎街头”），你必须在 [REPLY] 中进行肯定与润色，并且在 [ACTION] 的 smartParams.config.sceneStyle 中准确、完整、丰富地写出这个背景（例如：“原始森林深处，松针铺地，薄雾朦胧，阳光穿透树冠，极具野奢质感”），切勿遗漏用户要求的场景描述！并且将 "directGenerate" 为 true。
- 如果用户指令包含了特定的模特风格或特定肤色人种（例如：“生图欧美女模”、“我要黑人模特”、“换成亚洲金发模特”），你必须在 [ACTION] 的 smartParams.config.modelStyle 中准确设定该风格（例如：“欧美立体模特/时尚大片超模”或“African American model, professional high-fashion pose”），且必须将 "directGenerate" 设为 true。
- 绝不要遗漏 [REPLY] 和 [ACTION] 标记，确保两个标记在各自独占一行。
- 输出的分辨率（resolution）只能是 '1k'、'2k' or '4k'。
- 输出的比例（aspectRatio）只能是 '1:1'、'3:4' or '9:16'。`;

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
