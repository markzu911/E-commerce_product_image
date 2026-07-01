import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

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
    const { messages, imageBase64, currentConfig, currentAnalysis } = await req.json();

    const ai = getGeminiClient();

    // Prepare content parts for Gemini
    const parts: any[] = [];

    // Add current context about existing configuration to help the model make informed decisions
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

    // Add the user message and history
    // We can map history messages into the Gemini contents format
    const contents: any[] = [];
    
    // Add context as a system instruction or a priming message
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
        
        // Skip priming system instructions if any, handle normal user and model roles
        const role = msg.role === 'assistant' ? 'model' : 'user';
        
        const msgParts: any[] = [];
        msgParts.push({ text: msg.content });

        // If it's the very last user message and we have an image, feed the image to Gemini so it has vision context
        if (i === messages.length - 1 && role === 'user' && imageBase64) {
          const base64Data = imageBase64.split(',')[1];
          const mimeType = imageBase64.split(',')[0].split(':')[1].split(';')[0];
          msgParts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          });
        }

        contents.push({
          role,
          parts: msgParts
        });
      }
    }

    const systemInstruction = `你是一个顶级服装时尚买手、电商设计师和 AI 创意生图助理（FashionAI 助理）。你的任务是根据用户的提问和上传的商品图片，协助他们进行智能对话与生成。

你可以提供专业的时尚和生图意见，也可以在后台智能触发操作（动作）：
1. 'analyze_image': 用户询问图片特征、面料，或刚刚上传了新图片想进行分析。
2. 'generate_smart': 用户希望对商品开始生成各种电商图（主图、详情图、卖点图、场景图）。如说“生成一张在复古庄园的模特图”、“帮我做一张卖点宣传图”等。
   - 记得在 smartParams 中填写画布类型 type。
   - 在 config/analysis 中填入需要调整的对应参数。你可以智能地根据用户的输入和商品的气质，丰富背景描述、面料特点或模特风格，让其更有商业广告质感。
3. 'generate_custom': 用户希望尝试不限于固定模板的自由构思，或者是用户给出了具体大段生动描述（例如：“一件红色卫衣挂在枯木上，雪山背景，日出侧光”）。
   - 在 customParams.prompt 中填入你为用户量身定制、润色、翻译并优化的【英文高质量创意提示词】（提示词要写得非常生动、具有商业广告感、极高光影细节，比如: 'Editorial fashion photo, oversize knit sweater, detailed fabric fibers, rustic wooden table, cinematic window shadow play, luxury warm color tone, hyper-realistic, 8k resolution' 这样）。
4. 'update_config': 用户要求修改参数，但不立即画图（例如：“把衣服改成亮蓝色”、“把清晰度换成4k”、“我们换个沙滩背景看看，先不画”）。
   - 在 configParams 中填入想更新的 config/analysis 属性。
5. 'none': 用户只是问你问题，进行闲聊咨询，或者问你怎么使用，不需要调用任何画图/配置行为。

重要规范：
- 始终使用【中文（简体中文）】进行 conversational 回复 (reply)。语言要柔和、高端、具有设计师气质和专业度，解释你为什么要执行这个操作。
- 如果检测到画图意图，请务必设定正确的 action 并配置相应的参数。
- 保证用户提到要保留的细节一致。
- 如果用户指令是画模特场景，记得在 config 里的 modelStyle、sceneStyle 智能补全出最契合该衣服的文字（例如：“高挑欧美女模，优雅高级，微卷金发”、“法式复古庄园绿茵，柔和漫反射自然光影”）。
- 输出的分辨率（resolution）只能是 '1k'、'2k' 或 '4k'。
- 输出的比例（aspectRatio）只能是 '1:1'、'3:4' 或 '9:16'。`;

    // Generate JSON response matching schema
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: "对用户的中文回复。表达对设计的思考，或者解释接下来要做什么动作。"
            },
            action: {
              type: Type.STRING,
              description: "接下来触发的操作类型",
              enum: ["generate_smart", "generate_custom", "update_config", "analyze_image", "none"]
            },
            actionExplanation: {
              type: Type.STRING,
              description: "对即将执行动作的简短说明，如果 action 为 'none' 则可以为空"
            },
            smartParams: {
              type: Type.OBJECT,
              description: "智能生图所提取/润色补全的参数（action 为 generate_smart 时必需）",
              properties: {
                type: {
                  type: Type.STRING,
                  enum: ["main", "detail", "sellingPoint", "scene"]
                },
                config: {
                  type: Type.OBJECT,
                  properties: {
                    garmentCategory: { type: Type.STRING },
                    garmentColor: { type: Type.STRING },
                    garmentMaterial: { type: Type.STRING },
                    garmentStyle: { type: Type.STRING },
                    modelStyle: { type: Type.STRING },
                    sceneStyle: { type: Type.STRING },
                    sellingPoint1: { type: Type.STRING },
                    sellingPoint2: { type: Type.STRING },
                    sellingPoint3: { type: Type.STRING },
                    brandName: { type: Type.STRING },
                    sceneTheme: { type: Type.STRING },
                    resolution: { type: Type.STRING, enum: ["1k", "2k", "4k"] },
                    aspectRatio: { type: Type.STRING, enum: ["1:1", "3:4", "9:16"] }
                  }
                },
                analysis: {
                  type: Type.OBJECT,
                  properties: {
                    productName: { type: Type.STRING },
                    category: { type: Type.STRING },
                    style: { type: Type.STRING },
                    colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                    materials: { type: Type.STRING },
                    season: { type: Type.STRING },
                    description: { type: Type.STRING },
                    sellingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                    targetAudience: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    modelStyle: { type: Type.STRING },
                    sceneStyle: { type: Type.STRING },
                    brandName: { type: Type.STRING },
                    posterTheme: { type: Type.STRING }
                  }
                }
              }
            },
            customParams: {
              type: Type.OBJECT,
              description: "自由生图所构思润色、翻译成英文的参数（action 为 generate_custom 时必需）",
              properties: {
                prompt: {
                  type: Type.STRING,
                  description: "帮用户丰富、润色并翻译得到的极具艺术和质感细节的英文创意提示词"
                },
                resolution: {
                  type: Type.STRING,
                  enum: ["1k", "2k", "4k"]
                },
                aspectRatio: {
                  type: Type.STRING,
                  enum: ["1:1", "3:4", "9:16"]
                }
              }
            },
            configParams: {
              type: Type.OBJECT,
              description: "仅修改配置或参数（action 为 update_config 时填写）",
              properties: {
                config: {
                  type: Type.OBJECT,
                  properties: {
                    garmentCategory: { type: Type.STRING },
                    garmentColor: { type: Type.STRING },
                    garmentMaterial: { type: Type.STRING },
                    garmentStyle: { type: Type.STRING },
                    modelStyle: { type: Type.STRING },
                    sceneStyle: { type: Type.STRING },
                    sellingPoint1: { type: Type.STRING },
                    sellingPoint2: { type: Type.STRING },
                    sellingPoint3: { type: Type.STRING },
                    brandName: { type: Type.STRING },
                    sceneTheme: { type: Type.STRING },
                    resolution: { type: Type.STRING, enum: ["1k", "2k", "4k"] },
                    aspectRatio: { type: Type.STRING, enum: ["1:1", "3:4", "9:16"] }
                  }
                },
                analysis: {
                  type: Type.OBJECT,
                  properties: {
                    productName: { type: Type.STRING },
                    category: { type: Type.STRING },
                    style: { type: Type.STRING },
                    colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                    materials: { type: Type.STRING },
                    season: { type: Type.STRING },
                    description: { type: Type.STRING },
                    sellingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                    targetAudience: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    modelStyle: { type: Type.STRING },
                    sceneStyle: { type: Type.STRING },
                    brandName: { type: Type.STRING },
                    posterTheme: { type: Type.STRING }
                  }
                }
              }
            }
          },
          required: ["reply", "action"]
        }
      }
    });

    const resultText = response.text || '';
    const parsedData = JSON.parse(resultText);

    return NextResponse.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error('Chat error details:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
