'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EditableTextField, EditableTagList } from '@/components/EditableField';
import { AnalysisData, PromptConfig, Step, TextOverlayConfig } from '@/types';
import { analyzeImage, generateImage, generateCustomImage, generateVideo } from '@/lib/gemini';
import { Loader2, Upload, Download, CheckCircle, Image as ImageIcon, Sparkles, Maximize2, Edit2, Zap, Video, Play, X, Send, MessageSquare, ArrowLeft, Sliders, Wand2 } from 'lucide-react';
import { drawTextOverlay } from '@/lib/canvas-utils';

const PRESET_SCENES = [
  {
    id: 'nordic_living',
    name: '北欧极简暖色家居',
    styleText: '北欧极简暖雅原木家居，温和阳光柔和漫反射',
    description: 'Nordic minimalist living room with warm natural afternoon sunlight, cozy elegant wooden furniture, cream white walls, aesthetic potted plants.',
    previewUrl: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'urban_sunset',
    name: '现代摩登都市街区',
    styleText: '摩登都市奢华街区，温和日落逆光，现代时尚',
    description: 'Modern luxury urban street at sunset, soft bokeh city lights, skyscrapers background, chic editorial fashion backdrop.',
    previewUrl: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'french_manor',
    name: '法式复古绿荫庄园',
    styleText: '法式复古庄园绿茵庭院，斑驳树影，罗曼蒂克自然光影',
    description: 'Romantic French retro chateau garden, stone walls draped in ivy, dappled sunlight filtering through green trees, vintage luxury style.',
    previewUrl: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'marble_podium',
    name: '大理石极简艺术展台',
    styleText: '奢华大理石极简艺术展台，柔和冷暖对比光影，高级艺术感',
    description: 'Sleek luxury marble minimalist podium, soft geometric shadows, museum-like atmospheric lighting, high-end showroom background.',
    previewUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'beach_sunset',
    name: '宁静金晖沙滩海景',
    styleText: '金色落日余晖沙滩，温和波浪起伏，浪漫阳光海岸',
    description: 'Golden hour sunset over a serene sandy beach, soft ocean waves reflecting warm pink and orange sky, coastal editorial aesthetic.',
    previewUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'wabi_gallery',
    name: '侘寂风微水泥美术馆',
    styleText: '侘寂风微水泥艺术展馆，柔和漫反射自然采光，极简光影',
    description: 'Elegant wabi-sabi concrete gallery, clean geometric shadows, micro-cement walls, soft diffused minimalist natural lighting.',
    previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
  }
];

/**
 * Convert a remote image URL to base64 by drawing it on a canvas.
 * It uses crossOrigin = 'anonymous' so that CORS-enabled sites (like Unsplash) work.
 */
async function urlToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1000;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxDim) {
          h *= maxDim / w;
          w = maxDim;
        }
      } else {
        if (h > maxDim) {
          w *= maxDim / h;
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      reject(new Error('无法加载场景预设图片，请检查网络或更换预设'));
    };
    img.src = url;
  });
}

/**
 * Frontend image compression
 */
async function compressImage(base64: string, maxWidth = 1200, maxHeight = 1200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = base64;
  });
}

function ChatGenerationCard({ details }: { details: any }) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(p => {
        if (p < 25) return p + Math.floor(Math.random() * 4) + 2;
        if (p < 55) return p + Math.floor(Math.random() * 3) + 1;
        if (p < 85) return p + Math.floor(Math.random() * 2) + 1;
        if (p < 98) return p + 0.5;
        return p;
      });
    }, 450);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress < 25) setCurrentStep(0);
    else if (progress < 55) setCurrentStep(1);
    else if (progress < 80) setCurrentStep(2);
    else setCurrentStep(3);
  }, [progress]);

  const steps = [
    '解析服装物理材质、经纬织法与特征轮廓...',
    '构建多视角 3D 特征融合及模特透视骨骼...',
    '融合高级场景几何构图与多维柔性光影映射...',
    'AI 色彩校准与 StableDiffusion 广告级像素深度渲染...'
  ];

  const actionName = details?.action === 'generate_custom' ? '自由创意生图' : 'AI 智能多图场景渲染';

  return (
    <div className="w-full max-w-[550px] bg-slate-50 dark:bg-slate-900 border border-primary/20 rounded-[28px] p-5 shadow-lg shadow-primary/5 space-y-4 animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center text-primary animate-spin">
            <Loader2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span>{actionName}</span>
              <span className="text-[10px] text-primary font-bold">● CREATING</span>
            </h4>
            <p className="text-[9px] text-slate-400 font-medium">FashionAI 智脑图像创意引擎</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-primary/10 text-primary text-[9px] font-black px-2.5 py-1 rounded-full uppercase animate-pulse">
          <Sparkles className="w-3 h-3" />
          光影渲染中
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-2 gap-3 bg-white dark:bg-slate-950/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-[11px]">
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase">渲染画幅</span>
          <p className="font-black text-slate-700 dark:text-slate-300">{details?.aspectRatio || '3:4'}</p>
        </div>
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase">输出分辨率</span>
          <p className="font-black text-slate-700 dark:text-slate-300">{(details?.resolution || '2k').toUpperCase()} 画质</p>
        </div>
        {details?.action === 'generate_smart' ? (
          <>
            <div className="space-y-0.5 col-span-2 border-t border-slate-50 dark:border-slate-800 pt-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase">构思模特风格</span>
              <p className="font-bold text-slate-700 dark:text-slate-300 text-[10px] leading-tight">
                {details?.modelStyle || '高阶立体模特 / 真实国潮名模'}
              </p>
            </div>
            <div className="space-y-0.5 col-span-2 border-t border-slate-50 dark:border-slate-800 pt-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase">场景空间主题</span>
              <p className="font-bold text-slate-700 dark:text-slate-300 text-[10px] leading-tight">
                {details?.sceneStyle || '极简光影棚拍 / 创意商业空间'}
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-0.5 col-span-2 border-t border-slate-50 dark:border-slate-800 pt-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase">AI 创意提示词</span>
            <p className="font-medium text-slate-600 dark:text-slate-400 text-[10px] leading-normal italic line-clamp-2">
              "{details?.prompt}"
            </p>
          </div>
        )}
      </div>

      {/* Progress & Steps list */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[10px] font-bold">
          <span className="text-slate-400">整体渲染深度进度</span>
          <span className="text-primary font-black">{Math.floor(progress)}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary via-indigo-500 to-pink-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-1.5 pt-1">
          {steps.map((stepStr, idx) => {
            const isCompleted = idx < currentStep;
            const isActive = idx === currentStep;
            return (
              <div key={idx} className="flex items-start gap-2 text-[10px] transition-all">
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : isActive ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 dark:border-slate-800" />
                  )}
                </div>
                <span className={`font-medium ${
                  isCompleted 
                    ? 'text-slate-400 dark:text-slate-500 line-through decoration-slate-300 dark:decoration-slate-700' 
                    : isActive 
                      ? 'text-primary font-bold' 
                      : 'text-slate-400'
                }`}>
                  {stepStr}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [step, setStep] = useState<Step>('upload');
  const [imageBase64, setImageBase64] = useState<string>(''); // Product image for smart mode
  const [modelBase64, setModelBase64] = useState<string>('');
  const [sceneBase64, setSceneBase64] = useState<string>('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [isPresetLoading, setIsPresetLoading] = useState<boolean>(false);
  const [customReferenceBase64, setCustomReferenceBase64] = useState<string>(''); // Reference for custom mode
  
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'loading' | null, content: string }>({ type: null, content: '' });
  
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [config, setConfig] = useState<PromptConfig>({
    garmentCategory: '', garmentColor: '', garmentMaterial: '', garmentStyle: '',
    modelStyle: '', sceneStyle: '', sellingPoint1: '', sellingPoint2: '', sellingPoint3: '',
    brandName: '', sceneTheme: '', resolution: '2k',
    aspectRatio: '1:1'
  });
  
  const [selectedType, setSelectedType] = useState<string>('main');
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [activeMode, setActiveMode] = useState<'lobby' | 'normal' | 'chat'>('chat');
  const [normalSubMode, setNormalSubMode] = useState<'smart' | 'custom'>('smart');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [customResolution, setCustomResolution] = useState<'1k' | '2k' | '4k'>('2k');
  const [customResult, setCustomResult] = useState<string>('');

  const [chatMessages, setChatMessages] = useState<any[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '您好！我是您的 **FashionAI 智能创意设计师** 🌸\n\n我们将通过**一问一答的交互式对话**为您量身定制高质感商业大片。\n\n**🎯 简单 2 步，即刻开始：**\n1. 点击左下角 **附件/纸夹按钮**，上传您的单品原图（支持多张）。\n2. 在下方输入您的创意，或点击下方推荐的**新手创作灵感**，AI 会自动为您渲染大片并展示快捷参数调节看板。'
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [chatImageBase64, setChatImageBase64] = useState<string>('');
  const [chatConfig, setChatConfig] = useState<PromptConfig>({
    garmentCategory: '', garmentColor: '', garmentMaterial: '', garmentStyle: '',
    modelStyle: '', sceneStyle: '', sellingPoint1: '', sellingPoint2: '', sellingPoint3: '',
    brandName: '', sceneTheme: '', resolution: '2k',
    aspectRatio: '3:4'
  });
  const [chatAnalysis, setChatAnalysis] = useState<AnalysisData | null>(null);
  const [chatResolution, setChatResolution] = useState<'1k' | '2k' | '4k'>('2k');
  const [chatImages, setChatImages] = useState<string[]>([]);
  const [activeChatPreviewUrl, setActiveChatPreviewUrl] = useState<string>('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatAttachmentRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string>('');
  const [toolId, setToolId] = useState<string>('');
  const [userData, setUserData] = useState<any>(null);
  const [toolData, setToolData] = useState<any>(null);
  const [launchError, setLaunchError] = useState<string>('');

  const ALL_TYPES = [
    { id: 'main', label: '商品主图' },
    { id: 'detail', label: '商品详情图' },
    { id: 'sellingPoint', label: '卖点图' },
    { id: 'scene', label: '场景图' }
  ];

  const launchCalled = useRef(false);

  const callLaunch = useCallback(async (uid: string, tid: string, force = false) => {
    if (launchCalled.current && !force) return;
    launchCalled.current = true;
    setLaunchError('');
    try {
      const res = await fetch('/api/tool/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, toolId: tid })
      });
      const data = await res.json();
      if (data.success) {
        setUserData(data.data.user);
        setToolData(data.data.tool);
      } else {
        setLaunchError(data.error || '身份校验失败');
      }
    } catch (err: any) {
      console.error('Launch failed', err);
      setLaunchError(err.message || '加载用户信息失败');
      if (!force) launchCalled.current = false;
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uId = params.get('userId');
    const tId = params.get('toolId');
    
    requestAnimationFrame(() => {
      setMounted(true);
      if (uId) setUserId(uId);
      if (tId) setToolId(tId);
      if (uId && tId) {
        callLaunch(uId, tId);
      }
    });

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'SAAS_INIT') {
        const msgUserId = event.data.userId;
        const msgToolId = event.data.toolId;
        if (msgUserId) setUserId(msgUserId);
        if (msgToolId) setToolId(msgToolId);
        
        if (msgUserId && msgToolId) {
          callLaunch(msgUserId, msgToolId);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [callLaunch]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64 = event.target?.result as string;
      const compressed = await compressImage(b64);
      setImageBase64(compressed);
      setStep('select');
    };
    reader.readAsDataURL(file);
  };

  const startAnalysis = async () => {
    setStep('analyzing');
    setStatusMsg({ type: null, content: '' });
    try {
      const data = await analyzeImage(imageBase64, selectedType);
      setAnalysis(data);
      setConfig({
        garmentCategory: data.category || '',
        garmentColor: data.colors?.join(' ') || '',
        garmentMaterial: data.materials || '',
        garmentStyle: data.style || '',
        modelStyle: data.modelStyle || '',
        sceneStyle: data.sceneStyle || '',
        sellingPoint1: data.sellingPoints?.[0] || '',
        sellingPoint2: data.sellingPoints?.[1] || '',
        sellingPoint3: data.sellingPoints?.[2] || '',
        brandName: data.brandName || '',
        sceneTheme: data.posterTheme || '展示场景',
        resolution: '2k'
      });
      setStep('result');
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: 'error', content: `分析失败: ${err.message}` });
      setStep('upload');
    }
  };

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const compressed = await compressImage(event.target?.result as string);
      setModelBase64(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleSceneUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedPresetId(''); // Clear preset ID on manual upload
    const reader = new FileReader();
    reader.onload = async (event) => {
      const compressed = await compressImage(event.target?.result as string);
      setSceneBase64(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handlePresetSceneSelect = async (presetId: string) => {
    const preset = PRESET_SCENES.find(p => p.id === presetId);
    if (!preset) return;
    
    setIsPresetLoading(true);
    setSelectedPresetId(presetId);
    try {
      const base64 = await urlToBase64(preset.previewUrl);
      setSceneBase64(base64);
      // Synchronize prompt inputs and configs
      setConfig(prev => ({
        ...prev,
        sceneStyle: preset.styleText,
      }));
      if (analysis) {
        setAnalysis(prev => prev ? {
          ...prev,
          sceneStyle: preset.styleText,
          description: preset.description,
        } : null);
      }
    } catch (err: any) {
      console.error('Failed to load preset background:', err);
      setStatusMsg({ type: 'error', content: `预设加载失败: ${err.message || err}` });
    } finally {
      setIsPresetLoading(false);
    }
  };

  const handleClearScene = () => {
    setSceneBase64('');
    setSelectedPresetId('');
  };

  const handleGenerate = async () => {
    if (!analysis) return;
    if (!userId || !toolId) {
      setStatusMsg({ type: 'error', content: '缺少身份信息 (userId/toolId)，无法生成' });
      return;
    }
    setStep('generating');
    setIsGenerating(true);
    setStatusMsg({ type: 'loading', content: '正在生成并保存中...' });

    try {
      const { imageUrl } = await generateImage(
        selectedType, 
        imageBase64, 
        modelBase64 || null, 
        sceneBase64 || null, 
        analysis, 
        {
          ...config,
          isCustomScene: !!sceneBase64 && !selectedPresetId,
        },
        userId,
        toolId
      );
      setGeneratedImages(prev => ({ ...prev, [selectedType]: imageUrl }));
      setStatusMsg({ type: 'success', content: '生成成功！' });
      // Refresh user integral
      callLaunch(userId, toolId, true);
    } catch (e: any) {
      console.error(`Failed to generate ${selectedType}`, e);
      setStatusMsg({ type: 'error', content: `生成失败: ${e.message}` });
      setStep('result');
    }
    
    setIsGenerating(false);
    setStep('done');
    setTimeout(() => setStatusMsg({ type: null, content: '' }), 5000);
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const compressed = await compressImage(event.target?.result as string);
      setCustomReferenceBase64(compressed);
    };
    reader.readAsDataURL(file);
  };

  const handleCustomGenerate = async () => {
    if (!customPrompt) return;
    if (!userId || !toolId) {
      setStatusMsg({ type: 'error', content: '缺少身份信息 (userId/toolId)，无法生成' });
      return;
    }
    setIsGenerating(true);
    setCustomResult('');
    setStatusMsg({ type: 'loading', content: '正在生成并保存中...' });
    try {
      const { imageUrl } = await generateCustomImage(customPrompt, customReferenceBase64 || null, userId, toolId, customResolution);
      setCustomResult(imageUrl);
      setStatusMsg({ type: 'success', content: '生成成功！' });
      // Refresh user integral
      callLaunch(userId, toolId, true);
    } catch (e: any) {
      console.error('Failed to generate image', e);
      setStatusMsg({ type: 'error', content: `生成失败: ${e.message}` });
    }
    setIsGenerating(false);
    setTimeout(() => setStatusMsg({ type: null, content: '' }), 5000);
  };

  const handleChatAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Process all files
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const compressed = await compressImage(event.target?.result as string);
        setChatImages(prev => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleChatSend = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const query = (overrideQuery !== undefined ? overrideQuery : chatInput).trim();
    if (!query && chatImages.length === 0) return;

    // Determine the current image context for chat
    let activeImg = chatImageBase64;
    if (chatImages.length > 0) {
      activeImg = chatImages[0];
      setChatImageBase64(chatImages[0]);
    }

    const newUserMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query || `已成功上传 ${chatImages.length} 张单品参考图`,
      imageUrls: chatImages.length > 0 ? [...chatImages] : undefined,
    };

    setChatMessages(prev => [...prev, newUserMsg]);
    setChatInput('');
    setChatImages([]); // Reset list
    setIsChatLoading(true);

    const apiMessages = [...chatMessages, newUserMsg].map(m => ({
      role: m.role,
      content: m.content
    }));

    const typingId = `assistant-typing-${Date.now()}`;
    const newAssistantMsg: any = {
      id: typingId,
      role: 'assistant',
      content: '',
      actionSuccess: true
    };

    setChatMessages(prev => [...prev, newAssistantMsg]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          imageBase64: activeImg || null,
          imagesBase64: newUserMsg.imageUrls || null,
          currentConfig: chatConfig,
          currentAnalysis: chatAnalysis
        })
      });

      if (!response.ok) {
        let errorMsg = `API 错误: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errorMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error('未返回可读流');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value);
        accumulatedText += chunkText;

        // Extract [REPLY] and [ACTION]
        let replyPart = '';
        const actionIdx = accumulatedText.indexOf('[ACTION]');
        if (actionIdx !== -1) {
          replyPart = accumulatedText.substring(0, actionIdx);
        } else {
          replyPart = accumulatedText;
        }

        // Clean [REPLY] tag if present
        if (replyPart.startsWith('[REPLY]')) {
          replyPart = replyPart.substring(7);
        }
        replyPart = replyPart.trim();

        // Update the message in real-time
        setChatMessages(prev => prev.map(m => m.id === typingId ? { ...m, content: replyPart } : m));
        
        setTimeout(() => {
          chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }

      // Stream is done, parse action if [ACTION] exists
      const actionIdx = accumulatedText.indexOf('[ACTION]');
      if (actionIdx !== -1) {
        let actionPart = accumulatedText.substring(actionIdx + 8).trim();
        // Remove possible markdown quotes around JSON block
        if (actionPart.startsWith('```json')) {
          actionPart = actionPart.substring(7);
        }
        if (actionPart.endsWith('```')) {
          actionPart = actionPart.substring(0, actionPart.length - 3);
        }
        actionPart = actionPart.trim();

        let parsedAction: any = null;
        try {
          parsedAction = JSON.parse(actionPart);
        } catch (e) {
          console.error("Failed to parse action JSON:", e, actionPart);
        }

        if (parsedAction) {
          const { action, actionExplanation, smartParams, customParams, configParams } = parsedAction;

          // Update message metadata
          setChatMessages(prev => prev.map(m => m.id === typingId ? {
            ...m,
            actionType: action,
            actionExplanation
          } : m));

          // Run the action:
          if (action === 'analyze_image') {
            if (!activeImg) {
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + '\n\n*(提示：请先在对话框中上传单品原图再进行分析)*',
                actionSuccess: false
              } : m));
              setIsChatLoading(false);
              return;
            }
            try {
              const analyzed = await analyzeImage(activeImg, 'main');
              setChatAnalysis(analyzed);
              setChatConfig(prev => ({
                ...prev,
                garmentCategory: analyzed.category || '',
                garmentColor: analyzed.colors?.join(' ') || '',
                garmentMaterial: analyzed.materials || '',
                garmentStyle: analyzed.style || '',
                modelStyle: analyzed.modelStyle || '',
                sceneStyle: analyzed.sceneStyle || '',
                sellingPoint1: analyzed.sellingPoints?.[0] || '',
                sellingPoint2: analyzed.sellingPoints?.[1] || '',
                sellingPoint3: analyzed.sellingPoints?.[2] || '',
                brandName: analyzed.brandName || '',
                sceneTheme: analyzed.posterTheme || '展示场景',
              }));
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + `\n\n🎯 **分析完成！**\n- 商品名称: ${analyzed.productName}\n- 品类: ${analyzed.category}\n- 核心材质: ${analyzed.materials}\n- 推荐卖点: ${analyzed.sellingPoints?.join(', ')}`,
                actionSuccess: true
              } : m));
            } catch (err: any) {
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + `\n\n❌ **分析失败:** ${err.message}`,
                actionSuccess: false
              } : m));
            }
          }
          else if (action === 'update_config' && configParams) {
            if (configParams.config) {
              setChatConfig(prev => ({ ...prev, ...configParams.config }));
            }
            if (configParams.analysis) {
              setChatAnalysis(prev => prev ? ({ ...prev, ...configParams.analysis }) : (configParams.analysis as any));
            }
            setChatMessages(prev => prev.map(m => m.id === typingId ? {
              ...m,
              content: m.content + `\n\n⚙️ **生图参数已同步更新！** 您可以在下方互动看版核对或进行下一步渲染。`,
              actionSuccess: true
            } : m));
          }
          else if (action === 'generate_smart' && smartParams) {
            const refs = newUserMsg.imageUrls && newUserMsg.imageUrls.length > 0 
              ? newUserMsg.imageUrls 
              : (activeImg ? [activeImg] : []);

            if (refs.length === 0) {
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + '\n\n*(提示：请先通过对话框附件上传商品服装原图)*',
                actionSuccess: false
              } : m));
              setIsChatLoading(false);
              return;
            }

            if (!userId || !toolId) {
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + '\n\n*(提示：检测到需要智能生图，但当前运行环境未绑定 SaaS 平台账户身份 (userId/toolId 缺失)，无法扣除积分及上传云存证，因此暂时无法触发真实生图。请在 SaaS 平台主站内启动此工具进行真实图片生成。)*',
                actionSuccess: false
              } : m));
              setIsChatLoading(false);
              return;
            }

            const genType = smartParams.type || 'main';

            let finalAnalysis = chatAnalysis;
            if (smartParams.analysis) {
              finalAnalysis = chatAnalysis ? { ...chatAnalysis, ...smartParams.analysis } : (smartParams.analysis as any);
              setChatAnalysis(finalAnalysis);
            }
            
            let finalConfig = chatConfig;
            if (smartParams.config) {
              finalConfig = { ...chatConfig, ...smartParams.config };
              setChatConfig(finalConfig);
            }

            // Trigger visual progress card in chat box
            setChatMessages(prev => prev.map(m => m.id === typingId ? {
              ...m,
              isGeneratingImages: true,
              generationDetails: {
                action: 'generate_smart',
                aspectRatio: chatConfig.aspectRatio,
                resolution: chatResolution,
                modelStyle: finalConfig.modelStyle || '高阶立体模特/国风超模',
                sceneStyle: finalConfig.sceneStyle || '极简高阶棚拍',
                sceneTheme: finalConfig.sceneTheme || '展示场景'
              }
            } : m));

            setIsGenerating(true);
            try {
              const imageUrls: string[] = [];
              for (let i = 0; i < refs.length; i++) {
                const currentRef = refs[i];
                const { imageUrl } = await generateImage(
                   genType,
                   currentRef,
                   modelBase64 || null,
                   sceneBase64 || null,
                   finalAnalysis || { productName: '商品', category: '服装', style: '简约', colors: [], materials: '', season: '', description: '', sellingPoints: [], targetAudience: '', keywords: [], modelStyle: '', sceneStyle: '', brandName: '', posterTheme: '' },
                   {
                     ...finalConfig,
                     aspectRatio: chatConfig.aspectRatio,
                     resolution: chatResolution,
                     isCustomScene: !!sceneBase64 && !selectedPresetId,
                   },
                   userId,
                   toolId
                );
                imageUrls.push(imageUrl);
              }
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + `\n\n🎨 **AI 生图已成功完成！**`,
                generatedImageUrl: imageUrls[0],
                generatedImageUrls: imageUrls,
                isGeneratingImages: false,
                actionSuccess: true
              } : m));
              callLaunch(userId, toolId, true);
            } catch (err: any) {
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + `\n\n❌ **生图生成失败:** ${err.message}`,
                isGeneratingImages: false,
                actionSuccess: false
              } : m));
            }
            setIsGenerating(false);
          }
          else if (action === 'generate_custom' && customParams) {
            const cPrompt = customParams.prompt;
            const cRes = customParams.resolution || chatResolution;
            setChatResolution(cRes);

            if (!userId || !toolId) {
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + '\n\n*(提示：检测到需要自由生图，但当前运行环境未绑定 SaaS 平台账户身份 (userId/toolId 缺失)，无法扣除积分及上传云存证，因此暂时无法触发真实生图。请在 SaaS 平台主站内启动此工具进行真实图片生成。)*',
                actionSuccess: false
              } : m));
              setIsChatLoading(false);
              return;
            }

            const refs = newUserMsg.imageUrls && newUserMsg.imageUrls.length > 0 
              ? newUserMsg.imageUrls 
              : (activeImg ? [activeImg] : []);

            // Trigger visual progress card in chat box
            setChatMessages(prev => prev.map(m => m.id === typingId ? {
              ...m,
              isGeneratingImages: true,
              generationDetails: {
                action: 'generate_custom',
                prompt: cPrompt,
                resolution: cRes,
                aspectRatio: chatConfig.aspectRatio
              }
            } : m));

            setIsGenerating(true);
            try {
              const imageUrls: string[] = [];
              if (refs.length === 0) {
                const { imageUrl } = await generateCustomImage(cPrompt, null, userId, toolId, cRes);
                imageUrls.push(imageUrl);
              } else {
                for (let i = 0; i < refs.length; i++) {
                  const currentRef = refs[i];
                  const { imageUrl } = await generateCustomImage(cPrompt, currentRef, userId, toolId, cRes);
                  imageUrls.push(imageUrl);
                }
              }

              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + `\n\n🎨 **自由生图已顺利完成！**`,
                generatedImageUrl: imageUrls[0],
                generatedImageUrls: imageUrls,
                isGeneratingImages: false,
                actionSuccess: true
              } : m));
              callLaunch(userId, toolId, true);
            } catch (err: any) {
              setChatMessages(prev => prev.map(m => m.id === typingId ? {
                ...m,
                content: m.content + `\n\n❌ **自由生图创作失败:** ${err.message}`,
                isGeneratingImages: false,
                actionSuccess: false
              } : m));
            }
            setIsGenerating(false);
          }
        }
      }

    } catch (error: any) {
      console.error(error);
      const isApiKeyError = error.message && (
        error.message.includes('API key not valid') ||
        error.message.includes('API_KEY_INVALID') ||
        error.message.includes('valid API key')
      );

      const errorContent = isApiKeyError 
        ? `⚠️ **API Key 无效或未配置**\n\n系统检测到您的 API 密钥配置不正确、已失效或尚未添加。\n\n**解决方法：**\n1. 请点击应用右上角齿轮图标 **Settings (设置)**。\n2. 切换到 **Secrets (密钥)** 选项卡。\n3. 找到或新增名为 \`GEMINI_API_KEY_NEXT\` 或 \`GEMINI_API_KEY\` 的密钥，并填入您的真实、有效的 Google AI Studio API Key。\n4. 保存设置并刷新，然后重新发送即可！`
        : `抱歉，在与 AI 的连接或任务执行过程中出现了错误: ${error.message}。请重试。`;

      setChatMessages(prev => {
        const filtered = prev.filter(m => m.id !== typingId || m.content.trim() !== '');
        return [...filtered, {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: errorContent,
          actionSuccess: false
        }];
      });
    } finally {
      setIsChatLoading(false);
      setTimeout(() => {
        chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  };

  if (!mounted) return null;

  return (
    <div className="bg-[#FDFDFD] dark:bg-slate-950 transition-colors h-screen w-screen overflow-hidden flex flex-col">
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-b border-slate-100 dark:border-slate-800 px-10 py-4 flex items-center justify-between sticky top-0 z-50 transition-all">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setActiveMode('lobby')}>
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/30 group-hover:rotate-6 transition-transform">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-black tracking-[0.3em] uppercase leading-none mb-1">FashionAI</h1>
              <span className="text-[8px] font-bold text-primary/60 tracking-widest uppercase leading-none">Studio Pro v2</span>
            </div>
          </div>
          
          {activeMode !== 'lobby' && (
            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveMode('lobby')}
                className="gap-2 text-xs font-black text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl px-3.5 py-2 transition-all shadow-sm"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回入口大厅
              </Button>

              <nav className="flex items-center p-1 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100/50">
                 <button 
                   onClick={() => setActiveMode('normal')}
                   className={`px-8 py-2 rounded-[14px] text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${
                     activeMode === 'normal' 
                     ? 'bg-white dark:bg-slate-700 shadow-md text-primary scale-[1.02]' 
                     : 'text-slate-400 hover:text-slate-600'
                   }`}
                 >
                   正常生图
                 </button>
                 <button 
                   onClick={() => setActiveMode('chat')}
                   className={`px-8 py-2 rounded-[14px] text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 flex items-center gap-1.5 ${
                     activeMode === 'chat' 
                     ? 'bg-white dark:bg-slate-700 shadow-md text-primary scale-[1.02]' 
                     : 'text-slate-400 hover:text-slate-600'
                   }`}
                 >
                   <MessageSquare className="w-3.5 h-3.5 animate-pulse" />
                   AI 对话生图
                 </button>
              </nav>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-8">
          {activeMode === 'normal' && normalSubMode === 'smart' && (
            <div className="hidden xl:flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${step === 'upload' ? 'text-primary' : 'text-slate-300'}`}>01 Upload</span>
                <div className={`w-8 h-[2px] rounded-full transition-colors ${step === 'upload' ? 'bg-primary/20' : 'bg-slate-100'}`} />
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${step === 'select' ? 'text-primary' : 'text-slate-300'}`}>02 Style</span>
                <div className={`w-8 h-[2px] rounded-full transition-colors ${step === 'select' ? 'bg-primary/20' : 'bg-slate-100'}`} />
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${(step === 'analyzing' || step === 'result') ? 'text-primary' : 'text-slate-300'}`}>03 Config</span>
                <div className={`w-8 h-[2px] rounded-full transition-colors ${(step === 'analyzing' || step === 'result') ? 'bg-primary/20' : 'bg-slate-100'}`} />
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${(step === 'generating' || step === 'done') ? 'text-primary' : 'text-slate-300'}`}>04 Export</span>
              </div>
            </div>
          )}

          {userData && (
            <div className="flex items-center gap-4 pl-8 border-l border-slate-100 h-10">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black uppercase text-slate-800 dark:text-white tracking-widest leading-none mb-1.5">{userData.name}</span>
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 dark:bg-primary rounded-full shadow-lg shadow-black/10">
                  <span className="text-[10px] font-black text-white leading-none tracking-widest">{userData.integral} <small className="opacity-50">PTS</small></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 w-full max-w-[1500px] mx-auto px-4 md:px-8 py-3 flex flex-col">
        {statusMsg.type && (
          <div className={`mb-6 p-4 rounded-lg flex items-center justify-between shadow-sm border ${
            statusMsg.type === 'loading' ? 'bg-blue-50 border-blue-200 text-blue-600' :
            statusMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-600' :
            'bg-red-50 border-red-200 text-red-600'
          }`}>
            <div className="flex items-center gap-2">
              {statusMsg.type === 'loading' && <Loader2 className="w-5 h-5 animate-spin" />}
              {statusMsg.type === 'success' && <CheckCircle className="w-5 h-5" />}
              <span className="font-medium">{statusMsg.content}</span>
            </div>
            {statusMsg.type !== 'loading' && (
              <Button variant="ghost" size="sm" onClick={() => setStatusMsg({ type: null, content: '' })} className="hover:bg-black/5">关闭</Button>
            )}
          </div>
        )}

        {launchError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold">加载错误:</span>
              <span>{launchError}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="text-red-600 hover:bg-red-100">刷新重试</Button>
          </div>
        )}

        {activeMode === 'lobby' && (
          <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-6xl mx-auto py-6 px-4 animate-in fade-in zoom-in-95 duration-700">
            {/* Lobby Hero section */}
            <div className="text-center mb-8 space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 text-primary text-xs font-black uppercase tracking-[0.2em] mb-2">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                欢迎来到 FashionAI 创意生图工坊
              </div>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                请选择您的创意生成入口
              </h2>
              <p className="text-slate-400 dark:text-slate-500 font-medium max-w-2xl mx-auto text-xs md:text-sm tracking-normal">
                通过精密的数据参数对服装原衣进行极致的商业重塑，或使用强大的 AI 对话助手进行敏捷多轮交互式创作。
              </p>
            </div>

            {/* Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              
              {/* Card 1: Normal mode */}
              <div 
                onClick={() => {
                  setActiveMode('normal');
                  setNormalSubMode('smart');
                }}
                className="group relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[40px] p-8 md:p-10 shadow-xl shadow-slate-100/40 dark:shadow-none hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:border-primary/40 cursor-pointer transition-all duration-500 hover:-translate-y-1.5 flex flex-col justify-between min-h-[480px]"
              >
                <div className="space-y-6">
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 shadow-sm">
                    <Sliders className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-wide mb-2 flex items-center gap-2">
                      正常高级生图
                      <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">PRO</span>
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                      精密模板参数细粒度控制 · 自由文本创作驱动
                    </p>
                  </div>
                  
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    适合对衣服的款式特点、面料纤维、模特属性及环境光影有明确精细化要求的专业设计师与时尚买手。
                  </p>

                  <ul className="space-y-3.5 pt-4">
                    <li className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span><strong>智能分析</strong>：上传衣服一键提取核心卖点、类目及面料材质</span>
                    </li>
                    <li className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span><strong>多场景选择</strong>：六大经典商业预设场景（法式庄园、北欧家居、大理石艺术等）</span>
                    </li>
                    <li className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span><strong>高清画质</strong>：提供 1k、2k、4k 分辨率和多种主流电商图比例</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-8 mt-6 border-t border-slate-50 dark:border-slate-800/50 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-primary tracking-widest group-hover:translate-x-1 transition-transform">
                    进入专业工作台 →
                  </span>
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <Wand2 className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Card 2: Chat mode */}
              <div 
                onClick={() => {
                  setActiveMode('chat');
                }}
                className="group relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[40px] p-8 md:p-10 shadow-xl shadow-slate-100/40 dark:shadow-none hover:shadow-2xl hover:shadow-slate-200/50 dark:hover:border-primary/40 cursor-pointer transition-all duration-500 hover:-translate-y-1.5 flex flex-col justify-between min-h-[480px]"
              >
                <div className="space-y-6">
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 shadow-sm relative">
                    <MessageSquare className="w-7 h-7" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-wide mb-2 flex items-center gap-2">
                      AI 对话智能生图
                      <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">INTELLIGENT</span>
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                      多轮自然语言交互 · 双向智能看板联动
                    </p>
                  </div>
                  
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    全程使用中文与您的私人时尚 AI 设计助理对话，支持多轮润色、实时修改参数和敏捷绘图，创意无拘无束。
                  </p>

                  <ul className="space-y-3.5 pt-4">
                    <li className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span><strong>流式实时反馈</strong>：AI 助理生成极速响应，实时流式打字输出设计理念</span>
                    </li>
                    <li className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span><strong>双向状态同步</strong>：对话中所作的调整（如“换成沙滩背景”）将实时同步至参数看板</span>
                    </li>
                    <li className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      <span><strong>自然图文分析</strong>：可以直接通过回形针按钮发送图片并指示助理进行分析与定制</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-8 mt-6 border-t border-slate-50 dark:border-slate-800/50 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-primary tracking-widest group-hover:translate-x-1 transition-transform">
                    进入 AI 对话设计室 →
                  </span>
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeMode === 'normal' && (
          <div className="flex-1 min-h-0 flex flex-col space-y-3">
            {/* Elegant Inner Sub-mode Tabs */}
            <div className="flex justify-center my-2 animate-in fade-in duration-500 shrink-0">
              <div className="flex p-1 bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-200/20 shadow-inner">
                <button
                  onClick={() => setNormalSubMode('smart')}
                  className={`px-6 py-2.5 rounded-[12px] text-xs font-black tracking-wider uppercase transition-all duration-300 ${
                    normalSubMode === 'smart'
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-md scale-[1.02]'
                    : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  智能参数生图
                </button>
                <button
                  onClick={() => setNormalSubMode('custom')}
                  className={`px-6 py-2.5 rounded-[12px] text-xs font-black tracking-wider uppercase transition-all duration-300 ${
                    normalSubMode === 'custom'
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-md scale-[1.02]'
                    : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  自由文本生图
                </button>
              </div>
            </div>

            {normalSubMode === 'smart' && (
              <>
            {step === 'upload' && (
              <div className="flex-1 min-h-0 overflow-y-auto max-w-4xl mx-auto py-4 w-full flex flex-col justify-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="relative group p-1.5 rounded-[48px] bg-gradient-to-br from-slate-100 to-transparent dark:from-slate-800">
                  <div className="absolute -inset-4 bg-primary/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="relative flex flex-col items-center justify-center p-12 md:p-16 border border-slate-100 dark:border-slate-800 rounded-[40px] bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none hover:border-primary/20 transition-all cursor-pointer"
                       onClick={() => fileInputRef.current?.click()}>
                    <div className="w-20 h-20 bg-primary/5 rounded-[32px] flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                      <div className="w-14 h-14 bg-primary rounded-[24px] flex items-center justify-center shadow-lg shadow-primary/25">
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-center">开始您的 AI 创作之旅</h2>
                    <p className="text-slate-400 text-xs font-medium mb-6 text-center max-w-sm leading-relaxed">
                      上传服装单品，Gemini 3.5 将精准捕捉面料、剪裁与风格，定制专属电商视觉大片。
                    </p>
                    <Button size="lg" className="rounded-full px-10 h-14 font-black text-base shadow-xl shadow-primary/15 group-hover:scale-105 transition-transform">
                      立即上传单品
                    </Button>
                    <div className="mt-6 flex items-center gap-4 opacity-30 grayscale">
                      <span className="text-[9px] font-black uppercase tracking-widest">Supports Jpeg / Png / Webp</span>
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                  </div>
                </div>
              </div>
            )}

            {step === 'select' && (
              <div className="flex-1 min-h-0 overflow-y-auto max-w-6xl mx-auto py-4 w-full flex flex-col justify-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="text-center mb-6 shrink-0">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full border border-primary/10 mb-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary">Creative Direction</span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-1.5">定义输出画幅与风格</h2>
                  <p className="text-slate-400 text-xs font-medium tracking-tight max-w-xl mx-auto">
                    每一张生成的图片都经过视觉层级的深度优化，您可以针对不同的销售场景选择最佳画效。
                  </p>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 shrink-0">
                  {ALL_TYPES.map(type => (
                    <button 
                      key={type.id} 
                      onClick={() => setSelectedType(type.id)}
                      className={`relative p-6 rounded-[32px] border-2 text-left transition-all group duration-500 ${
                        selectedType === type.id 
                        ? 'border-primary bg-primary/[0.02] shadow-2xl shadow-primary/5 scale-[1.02]' 
                        : 'border-slate-50 bg-white hover:border-slate-100 hover:shadow-xl hover:shadow-slate-100/50'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center mb-4 transition-all duration-500 shadow-lg ${
                        selectedType === type.id ? 'bg-primary text-primary-foreground shadow-primary/20 rotate-6' : 'bg-slate-50 text-slate-400 shadow-none'
                      }`}>
                         {type.id === 'main' && <ImageIcon className="w-6 h-6" />}
                         {type.id === 'detail' && <Maximize2 className="w-6 h-6" />}
                         {type.id === 'sellingPoint' && <Sparkles className="w-6 h-6" />}
                         {type.id === 'scene' && <ImageIcon className="w-6 h-6" />}
                      </div>
                      <h3 className={`text-base font-black mb-1 tracking-tight transition-colors ${selectedType === type.id ? 'text-primary' : 'text-slate-800'}`}>
                        {type.label}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-4">
                        {type.id === 'main' && '标准 1:1 特写。针对主图展示优化，背景通透、产品饱满。'}
                        {type.id === 'detail' && '高清微距感。细腻捕捉针脚、面料纹理与辅料细节。'}
                        {type.id === 'sellingPoint' && '广告级排版。结合核心卖点，打造极具沉浸感的营销视觉。'}
                        {type.id === 'scene' && '自然光影律动。模拟真实户内/户外环境，赋予商品温度。'}
                      </p>
                      
                      <div className="flex items-center gap-1.5">
                         <div className={`w-6 h-[2px] rounded-full transition-colors ${selectedType === type.id ? 'bg-primary' : 'bg-slate-100'}`} />
                         <span className={`text-[9px] font-black uppercase tracking-widest ${selectedType === type.id ? 'text-primary' : 'text-slate-300'}`}>
                           {selectedType === type.id ? 'Selected' : 'Select Style'}
                         </span>
                      </div>

                      {selectedType === type.id && (
                        <div className="absolute top-6 right-6">
                          <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-primary" />
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex justify-center shrink-0">
                  <Button size="lg" onClick={startAnalysis} className="rounded-full px-12 h-14 font-black text-base shadow-[0_15px_40px_rgba(var(--primary-rgb),0.15)] hover:scale-105 transition-all">
                    同步数据并分析 <Sparkles className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {step === 'analyzing' && (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-12">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                <h2 className="text-xl font-bold mb-2">正在分析商品...</h2>
                <p className="text-slate-400 text-sm">AI 正在提取详情、风格和卖点</p>
              </div>
            )}

            {step === 'result' && analysis && (
              <div className="flex-1 min-h-0 flex flex-col w-full space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* Header Section: Title & Main Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-px bg-primary/30" />
                      <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary">Intelligence Engine v3</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">定制精炼参数</h2>
                  </div>
                  <div className="flex items-center gap-2">
                     <Button variant="outline" className="rounded-xl px-6 h-12 font-black text-xs border-slate-100 dark:border-slate-800 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all" onClick={() => setStep('select')}>
                       返回风格选择
                     </Button>
                     <Button onClick={handleGenerate} className="rounded-xl px-8 h-12 font-black shadow-[0_25px_60px_rgba(var(--primary-rgb),0.25)] hover:bg-primary/90 hover:scale-105 transition-all text-sm group">
                       启动精炼生成 <Zap className="w-5 h-5 ml-2 fill-current group-hover:animate-pulse" />
                     </Button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch overflow-hidden">
                  {/* Left Sidebar: Assets */}
                  <aside className="lg:col-span-3 space-y-4 overflow-y-auto pr-1">
                    <div className="relative">
                      <div className="absolute -inset-4 bg-primary/5 blur-[40px] opacity-50" />
                      <div className="relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] overflow-hidden shadow-2xl shadow-slate-200/50 dark:shadow-none">
                        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">Master Ref</span>
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="relative group/ref overflow-hidden rounded-[20px]">
                             <img src={imageBase64} className="w-full aspect-[3/4] object-cover shadow-2xl border border-slate-50 group-hover:scale-105 transition-transform duration-700" alt="Original" />
                             <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/ref:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="grid gap-4">
                        {selectedType !== 'main' && selectedType !== 'detail' && (
                          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] p-5 shadow-sm hover:shadow-2xl hover:shadow-slate-200/30 transition-all group">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 block">模特参考 (Portrait)</Label>
                            {modelBase64 ? (
                              <div className="relative rounded-[16px] overflow-hidden group/img shadow-2xl">
                                <img src={modelBase64} className="w-full aspect-[4/5] object-cover" alt="Model" />
                                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center backdrop-blur-[6px]">
                                  <Button size="sm" variant="secondary" className="rounded-full font-black text-[9px] uppercase tracking-widest" onClick={() => setModelBase64('')}>更换参考</Button>
                                </div>
                              </div>
                            ) : (
                              <div 
                                className="aspect-[4/5] border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center rounded-[20px] bg-slate-50/50 dark:bg-slate-950 transition-all hover:border-primary/40 hover:bg-slate-50 cursor-pointer" 
                                onClick={() => modelInputRef.current?.click()}
                              >
                                <Sparkles className="w-6 h-6 text-primary/40 mb-2" />
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] text-center px-4">上传人像参考</span>
                                <input type="file" ref={modelInputRef} className="hidden" accept="image/*" onChange={handleModelUpload} />
                              </div>
                            )}
                          </div>
                        )}

                        {selectedType === 'scene' && (
                          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] p-5 shadow-sm hover:shadow-2xl hover:shadow-slate-200/30 transition-all space-y-4">
                            <div className="flex items-center justify-between">
                              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">背景参考</Label>
                              {selectedPresetId && (
                                <span className="bg-amber-500/10 text-amber-500 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  预设底片
                                </span>
                              )}
                              {!selectedPresetId && sceneBase64 && (
                                <span className="bg-primary/10 text-primary text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  自定义上传
                                </span>
                              )}
                            </div>
                            
                            {isPresetLoading ? (
                              <div className="aspect-[4/5] flex flex-col items-center justify-center rounded-[20px] bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center px-2">载入中...</span>
                              </div>
                            ) : sceneBase64 ? (
                              <div className="space-y-3">
                                <div className="relative rounded-[16px] overflow-hidden group/img shadow-2xl aspect-[4/5]">
                                  <img src={sceneBase64} className="w-full h-full object-cover" alt="Scene" />
                                  <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center backdrop-blur-[6px]">
                                    <Button size="sm" variant="secondary" className="rounded-full font-black text-[9px] uppercase tracking-widest" onClick={handleClearScene}>清除底片</Button>
                                  </div>
                                </div>
                                {selectedPresetId && (
                                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl">
                                    <p className="text-[10px] font-black text-slate-700 dark:text-slate-300">
                                      {PRESET_SCENES.find(p => p.id === selectedPresetId)?.name}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {/* Preset Scenes Grid */}
                                <div className="grid grid-cols-2 gap-2">
                                  {PRESET_SCENES.map((preset) => (
                                    <button
                                      key={preset.id}
                                      onClick={() => handlePresetSceneSelect(preset.id)}
                                      className="relative rounded-xl overflow-hidden aspect-[4/5] group border border-slate-100 dark:border-slate-800/50 hover:border-primary/40 shadow-sm hover:shadow-md transition-all text-left"
                                    >
                                      <img src={preset.previewUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={preset.name} />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-2">
                                        <p className="text-[9px] font-black text-white tracking-wide">{preset.name}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>

                                <div className="relative">
                                  <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-100 dark:border-slate-800" />
                                  </div>
                                  <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white dark:bg-slate-900 px-2 text-[8px] font-black tracking-widest text-slate-400">或</span>
                                  </div>
                                </div>

                                {/* Custom Upload Button */}
                                <div 
                                  className="py-4 border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center rounded-[20px] bg-slate-50/50 dark:bg-slate-950 transition-all hover:border-primary/40 hover:bg-slate-50 cursor-pointer group" 
                                  onClick={() => sceneInputRef.current?.click()}
                                >
                                  <Upload className="w-5 h-5 text-primary/40 mb-1 group-hover:scale-110 transition-transform" />
                                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center px-2">上传背景</span>
                                  <input type="file" ref={sceneInputRef} className="hidden" accept="image/*" onChange={handleSceneUpload} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </aside>

                  {/* Right Main Dashboard: 3 Columns of Parameters with independent overflow scrolling! */}
                  <div className="lg:col-span-9 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[40px] shadow-2xl shadow-slate-200/30 dark:shadow-none p-8 lg:p-10 relative overflow-y-auto max-h-full">
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/[0.02] blur-[100px] -mr-40 -mt-40 rounded-full" />
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/[0.02] blur-[100px] -ml-40 -mb-40 rounded-full" />
                    
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 xl:gap-12">
                      {/* Column 1: Data Analysis */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                            <span className="text-[10px] font-black">01</span>
                          </div>
                          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-white">数据分析</h3>
                        </div>
                        
                        <div className="space-y-5">
                          <EditableTextField label="商品对象" value={analysis.productName} onChange={(v) => setAnalysis({...analysis, productName: v})} />
                          <EditableTextField label="商品品类" value={analysis.category} onChange={(v) => setAnalysis({...analysis, category: v})} />
                          <EditableTextField label="面料纹理" value={analysis.materials} onChange={(v) => setAnalysis({...analysis, materials: v})} />
                          <EditableTextField label="核心描述" value={analysis.description} onChange={(v) => setAnalysis({...analysis, description: v})} />
                        </div>
                      </div>

                      {/* Column 2: Refine Parameters */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <span className="text-[10px] font-black">02</span>
                          </div>
                          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-white">精修参数</h3>
                        </div>

                        <div className="space-y-5">
                          <EditableTextField label="风格方向" value={config.garmentStyle} onChange={(v) => setConfig({...config, garmentStyle: v})} />
                          <EditableTextField label="材质细节" value={config.garmentMaterial} onChange={(v) => setConfig({...config, garmentMaterial: v})} />
                          <EditableTextField label="光影氛围" value={config.sceneStyle} onChange={(v) => setConfig({...config, sceneStyle: v})} />
                          <EditableTextField label="构图控制" value={config.garmentCategory} onChange={(v) => setConfig({...config, garmentCategory: v})} />
                        </div>
                        
                        <div className="p-5 bg-amber-500/5 rounded-2xl border border-amber-500/10 shadow-inner">
                          <div className="flex items-center gap-2 mb-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">原图硬核还原</span>
                          </div>
                          <p className="text-[10px] font-medium text-slate-500 leading-relaxed italic">
                            系统将强制锁定原图中的产品结构与材质。
                          </p>
                        </div>
                      </div>

                      {/* Column 3: Output Specs */}
                      <div className="space-y-6 md:col-span-2 xl:col-span-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <span className="text-[10px] font-black">03</span>
                          </div>
                          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-white">输出规格</h3>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">分辨率 (Resolution)</Label>
                            <div className="grid grid-cols-3 gap-2">
                              {(['1k', '2k', '4k'] as const).map((res) => (
                                <button
                                  key={res}
                                  onClick={() => setConfig({ ...config, resolution: res })}
                                  className={`h-11 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    config.resolution === res 
                                    ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105' 
                                    : 'bg-slate-50/50 border-slate-100 text-slate-400 hover:border-primary/30'
                                  }`}
                                >
                                  {res === '1k' ? '1K' : res === '2k' ? '2K' : '4K'}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">画幅比例 (Aspect Ratio)</Label>
                            <div className="grid grid-cols-3 gap-2">
                              {(['1:1', '3:4', '9:16'] as const).map((ratio) => (
                                <button
                                  key={ratio}
                                  onClick={() => setConfig({ ...config, aspectRatio: ratio as any })}
                                  className={`h-11 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    config.aspectRatio === ratio 
                                    ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105' 
                                    : 'bg-slate-50/50 border-slate-100 text-slate-400 hover:border-primary/30'
                                  }`}
                                >
                                  {ratio}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10 shadow-inner">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Zap className="w-3.5 h-3.5 text-primary" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-primary">Neural Optimization</span>
                            </div>
                            <p className="text-[10px] font-medium text-slate-500 leading-relaxed italic">
                              AI 将基于您的规格自动调整光影采样率。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Options Footer */}
                    <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6">
                       <EditableTagList label="Color Schema (色彩方案)" tags={analysis.colors} onChange={(v) => setAnalysis({...analysis, colors: v})} />
                       <EditableTagList label="Value Props (卖点关键词)" tags={analysis.sellingPoints} onChange={(v) => setAnalysis({...analysis, sellingPoints: v})} />
                       <EditableTagList label="Semantic Keywords (语义词包)" tags={analysis.keywords} onChange={(v) => setAnalysis({...analysis, keywords: v})} />
                    </div>
                  </div>
                </div>
              </div>
            )}


        {(step === 'generating' || step === 'done') && (
          <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-4xl mx-auto py-4 space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">
                {isGenerating ? '正在生成素材...' : '生成完成'}
              </h2>
              <div className="flex items-center gap-3">
                {isGenerating && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                {step === 'done' && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setStep('select')}>生成其他类型图片</Button>
                    <Button variant="secondary" size="sm" onClick={() => setStep('result')}>修改当前配置</Button>
                    <Button size="sm" onClick={handleGenerate}>重新生成</Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-center w-full">
              <ResultCard 
                type={selectedType} 
                imgSrc={generatedImages[selectedType]} 
                analysis={analysis!} 
                userId={userId}
                toolId={toolId}
                config={config}
              />
            </div>
          </div>
        )}
        </>
        )}

        {normalSubMode === 'custom' && (
          <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-4xl mx-auto space-y-6 py-6 animate-in fade-in slide-in-from-bottom-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-[20px] flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-2xl font-black tracking-tight mb-2">产品 + 创意：探索无限可能</h2>
              <p className="text-slate-400 font-medium text-xs tracking-tight px-4 max-w-xl">
                上传您的单品原图，输入创意构思。AI 将保证产品样式 100% 还原，并根据您的描述灵活调整模特姿势与环境。
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 block">产品原图 (100% 还原基础)</Label>
                  {customReferenceBase64 ? (
                     <div className="relative group rounded-xl overflow-hidden aspect-square shadow-xl">
                        <img src={customReferenceBase64} className="w-full h-full object-cover" alt="Custom Reference" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button size="sm" variant="secondary" onClick={() => setCustomReferenceBase64('')}>更换原图</Button>
                        </div>
                     </div>
                  ) : (
                    <div 
                      className="aspect-square border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center rounded-2xl bg-slate-50/50 dark:bg-slate-950 transition-all hover:border-primary/40 hover:bg-slate-50 cursor-pointer group" 
                      onClick={() => customInputRef.current?.click()}
                    >
                      <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                        <Upload className="w-5 h-5 text-primary" />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center px-4">点击上传产品原图<br/><small className="opacity-50">AI 将保证商品 100% 不变</small></span>
                      <input type="file" ref={customInputRef} className="hidden" accept="image/*" onChange={handleCustomUpload} />
                    </div>
                  )}
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                  <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> 自由生图贴士
                  </h4>
                  <p className="text-[10px] text-emerald-600/70 font-medium leading-relaxed italic">
                    &quot;描述中包含：光效细节、材质质感、模特姿势、背景环境等。您可以自由构思，AI 将保证产品完美融入并 100% 还原。&quot;
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 block">输出清晰度</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['1k', '2k', '4k'] as const).map((res) => (
                      <button
                        key={res}
                        onClick={() => setCustomResolution(res)}
                        className={`py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all border ${
                          customResolution === res
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'bg-slate-50 border-slate-100 text-slate-400'
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3 space-y-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 block">创意描述 (Prompt)</Label>
                  <textarea 
                    className="w-full min-h-[160px] p-4 text-sm font-medium border-none bg-slate-50/50 dark:bg-slate-950 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-slate-300" 
                    placeholder="例如：\n极简纯白背景，一件oversize风格的黑色卫衣挂在木质衣架上，柔和侧光，高清写实材质..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                  />
                  <div className="pt-4 flex justify-end">
                    <Button 
                      size="sm" 
                      onClick={handleCustomGenerate} 
                      disabled={!customPrompt || isGenerating} 
                      className="rounded-full px-8 h-10 font-bold shadow-lg shadow-primary/15"
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                      {isGenerating ? '正在构思中...' : '开始生成'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {customResult && (
              <div className="pt-6 text-center animate-in fade-in slide-in-from-bottom-8">
                <div className="flex items-center justify-center gap-2 mb-6">
                  <div className="h-px w-8 bg-slate-100" />
                  <h3 className="text-lg font-black tracking-tight uppercase">生成结果</h3>
                  <div className="h-px w-8 bg-slate-100" />
                </div>
                
                <div className="inline-block relative rounded-2xl overflow-hidden shadow-xl border-2 border-white dark:border-slate-800">
                  <img src={customResult} className="max-w-full max-h-[50vh] object-contain" alt="Custom Generated" />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex justify-between items-end opacity-0 hover:opacity-100 transition-opacity duration-500">
                    <div className="text-left">
                       <p className="text-[8px] font-bold text-white/50 uppercase tracking-widest mb-0.5">自由生图模式</p>
                       <p className="text-white text-xs font-bold truncate max-w-xs">{customPrompt}</p>
                    </div>
                    <Button variant="secondary" size="sm" className="rounded-full font-bold px-4" onClick={() => {
                      const link = document.createElement('a');
                      link.download = `fashion-ai-custom.png`;
                      link.href = customResult;
                      link.click();
                    }}>
                      <Download className="w-3.5 h-3.5 mr-1" />
                      下载高清图
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
          </div>
        )}

        {activeMode === 'chat' && (
          <div className="flex-1 min-h-0 w-full max-w-4xl mx-auto px-4 flex flex-col justify-stretch py-2 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[32px] overflow-hidden shadow-2xl shadow-slate-200/50 dark:shadow-none">
              {/* Chat Header */}
              <div className="px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <MessageSquare className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black tracking-wider uppercase">FashionAI 创意助理</h3>
                    <p className="text-[10px] text-slate-400 font-medium">多轮对话流式助理 · 精准生成与细节设计</p>
                  </div>
                </div>
                {/* Sync Indicator */}
                <div className="flex items-center gap-2">
                   {chatImageBase64 ? (
                     <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                       <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                       <span className="text-[9px] font-black uppercase text-green-600 tracking-wider">参考底图已载入</span>
                     </div>
                   ) : (
                     <button 
                       onClick={() => chatAttachmentRef.current?.click()}
                       className="px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-black uppercase tracking-wider rounded-full transition-all"
                     >
                       上传参考图
                     </button>
                   )}
                </div>
              </div>

              {/* Messages Box */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 min-h-0">
                {chatMessages.map((msg) => {
                  if (msg.role === 'assistant' && !msg.content && !msg.generatedImageUrl && !msg.isGeneratingImages) {
                    return null;
                  }
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role !== 'user' && (
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 self-start">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}

                      <div className={`max-w-[85%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      {/* User uploaded multi-images rendering */}
                      {msg.imageUrls && msg.imageUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-1 justify-end">
                          {msg.imageUrls.map((url: string, i: number) => (
                            <div 
                              key={i} 
                              className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md max-w-[150px] bg-slate-50 relative group cursor-pointer"
                              onClick={() => setActiveChatPreviewUrl(url)}
                            >
                              <img src={url} alt={`Uploaded attachment ${i + 1}`} className="w-full object-cover max-h-[150px] group-hover:scale-105 transition-transform duration-300" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <Maximize2 className="w-4 h-4 text-white hover:scale-110 transition-transform" />
                                <a 
                                  href={url} 
                                  download={`original_reference_${i + 1}_${Date.now()}.jpg`}
                                  className="p-1 bg-white/20 hover:bg-white/40 rounded-lg text-white hover:scale-110 transition-transform"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Download className="w-4 h-4 text-white" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Single fallback user attachment */}
                      {msg.imageUrl && (!msg.imageUrls || msg.imageUrls.length === 0) && (
                        <div 
                          className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md max-w-[200px] mb-1 bg-slate-50 relative group cursor-pointer"
                          onClick={() => setActiveChatPreviewUrl(msg.imageUrl || '')}
                        >
                          <img src={msg.imageUrl} alt="Uploaded attachment" className="w-full object-cover max-h-[200px] group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Maximize2 className="w-4 h-4 text-white hover:scale-110 transition-transform" />
                            <a 
                              href={msg.imageUrl} 
                              download={`original_reference_${Date.now()}.jpg`}
                              className="p-1 bg-white/20 hover:bg-white/40 rounded-lg text-white hover:scale-110 transition-transform"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="w-4 h-4 text-white" />
                            </a>
                          </div>
                        </div>
                      )}

                      {msg.content && (
                        <div className={`px-4 py-2.5 sm:px-5 sm:py-3 rounded-[24px] text-sm leading-relaxed whitespace-pre-wrap font-medium shadow-sm ${
                          msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-none' 
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-800'
                        }`}>
                          {msg.content}
                        </div>
                      )}

                      {msg.isGeneratingImages && (
                        <ChatGenerationCard details={msg.generationDetails} />
                      )}

                      {/* AI Generated image(s) in chat bubble with direct preview and download */}
                      {msg.generatedImageUrls && msg.generatedImageUrls.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 max-w-[650px] w-full">
                          {msg.generatedImageUrls.map((gUrl: string, idx: number) => (
                            <div key={idx} className="border border-slate-100 dark:border-slate-800 rounded-[28px] overflow-hidden shadow-xl hover:shadow-2xl transition-all bg-slate-50 dark:bg-slate-900 group">
                              <div className="relative cursor-pointer overflow-hidden" onClick={() => setActiveChatPreviewUrl(gUrl)}>
                                <img 
                                  src={gUrl} 
                                  alt={`AI Generated outcome ${idx + 1}`} 
                                  className="w-full object-cover aspect-[3/4] group-hover:scale-[1.02] transition-transform duration-500" 
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                  <span className="px-4 py-2 bg-white/95 text-slate-900 text-xs font-black rounded-full shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                                    <Maximize2 className="w-3.5 h-3.5 animate-pulse" />
                                    点击预览
                                  </span>
                                </div>
                              </div>
                              
                              {/* Details & Download bar */}
                              <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">
                                    {chatConfig.aspectRatio || '3:4'} • {chatResolution || '2k'} 画质 ({idx + 1}/{msg.generatedImageUrls.length})
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-medium">商业级广告渲染</span>
                                </div>
                                <a 
                                  href={gUrl} 
                                  download={`fashion_ai_${idx + 1}_${Date.now()}.jpg`}
                                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white text-xs font-black rounded-xl transition-all flex items-center gap-1 shadow-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Download className="w-3 h-3" />
                                  下载
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        msg.generatedImageUrl && (
                          <div className="mt-3 border border-slate-100 dark:border-slate-800 rounded-[28px] overflow-hidden shadow-xl hover:shadow-2xl transition-all max-w-[400px] bg-slate-50 dark:bg-slate-900 group">
                            <div className="relative cursor-pointer overflow-hidden" onClick={() => setActiveChatPreviewUrl(msg.generatedImageUrl)}>
                              <img 
                                src={msg.generatedImageUrl} 
                                alt="AI Generated outcome" 
                                className="w-full object-cover aspect-[3/4] group-hover:scale-[1.02] transition-transform duration-500" 
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                <span className="px-4 py-2 bg-white/95 text-slate-900 text-xs font-black rounded-full shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                                  <Maximize2 className="w-3.5 h-3.5 animate-pulse" />
                                  点击预览高清图
                                </span>
                              </div>
                            </div>
                            
                            {/* Details & Download bar */}
                            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">
                                  {chatConfig.aspectRatio || '3:4'} • {chatResolution || '2k'} 画质
                                </span>
                                <span className="text-[9px] text-slate-400 font-medium">商业级广告渲染</span>
                              </div>
                              <a 
                                href={msg.generatedImageUrl} 
                                download={`fashion_ai_${Date.now()}.jpg`}
                                className="px-4 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="w-3.5 h-3.5" />
                                下载原图
                              </a>
                            </div>
                          </div>
                        )
                      )}

                      {/* 1. Welcome suggestions for empty state */}
                      {msg.id === 'welcome' && chatMessages.length === 1 && (
                        <div className="mt-4 p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/40 dark:to-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl max-w-xl w-full animate-in fade-in-50 duration-500 shadow-sm space-y-3.5">
                          <div className="flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-primary animate-pulse" />
                            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">新手创作灵感星火：</span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {[
                              { text: '帮我做一张卖点图，突出面料舒适', desc: '展现温润柔和自然光影，慵懒呼吸感' },
                              { text: '我想生成欧美女模，背景设定在咖啡馆', desc: '街头咖啡馆，温和午后光，优雅时尚' },
                              { text: '自由构思：挂在山顶枯木上，荒野孤寂冷色调', desc: '大衣悬挂枯木，深灰枯草，极具艺术感' },
                              { text: '分析并提取这件衣服的设计特点', desc: '顶级买手深度分析并自动同步生图配置' }
                            ].map((item, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (!chatImageBase64) {
                                    setChatInput(item.text);
                                    setStatusMsg({ type: 'success', content: '💡 请先点击对话框左下角回形针上传衣服原图，再进行生成！' });
                                    chatAttachmentRef.current?.click();
                                  } else {
                                    handleChatSend(undefined, item.text);
                                  }
                                }}
                                className="p-3 bg-white dark:bg-slate-900 hover:bg-primary/5 dark:hover:bg-primary/10 border border-slate-100 dark:border-slate-800 rounded-xl text-left transition-all hover:scale-[1.01] hover:border-primary/20 shadow-sm"
                              >
                                <p className="text-xs font-black text-slate-700 dark:text-slate-200 line-clamp-1 mb-0.5">{item.text}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{item.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 2. Interactive next-steps and parameters adjustment */}
                      {msg.id !== 'welcome' && msg.role === 'assistant' && !isChatLoading && msg.id === chatMessages.filter(m => m.role === 'assistant').pop()?.id && (
                        <div className="mt-3.5 space-y-3 p-4 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-100/80 dark:border-slate-800 rounded-2xl max-w-xl w-full animate-in fade-in-50 duration-500 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Sliders className="w-3.5 h-3.5 text-primary" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">智能参数调节与下一步操作</span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600">点击自动配置并直接生图</span>
                          </div>

                          {/* Fast interactive options */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!chatImageBase64) {
                                  setStatusMsg({ type: 'error', content: '💡 请先点击对话框左下角回形针上传单品参考图！' });
                                  chatAttachmentRef.current?.click();
                                } else {
                                  handleChatSend(undefined, "直接生成商品主图");
                                }
                              }}
                              className="px-3 py-2 text-left bg-white dark:bg-slate-900 hover:bg-primary/5 dark:hover:bg-primary/10 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-primary transition-all flex items-center gap-2 shadow-sm"
                            >
                              <Sparkles className="w-4 h-4 text-primary shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-extrabold text-[11px] truncate text-slate-700 dark:text-slate-200">📸 1. 生成商品主图 (Main)</span>
                                <span className="text-[9px] text-slate-400 font-normal truncate">流式设计高档主图海报</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (!chatImageBase64) {
                                  setStatusMsg({ type: 'error', content: '💡 请先点击对话框左下角回形针上传单品参考图！' });
                                  chatAttachmentRef.current?.click();
                                } else {
                                  handleChatSend(undefined, "切换到模特上身并生成");
                                }
                              }}
                              className="px-3 py-2 text-left bg-white dark:bg-slate-900 hover:bg-primary/5 dark:hover:bg-primary/10 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-primary transition-all flex items-center gap-2 shadow-sm"
                            >
                              <Wand2 className="w-4 h-4 text-primary shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-extrabold text-[11px] truncate text-slate-700 dark:text-slate-200">💃 2. 模特效果生图 (Model)</span>
                                <span className="text-[9px] text-slate-400 font-normal truncate">服装真人高档模特渲染</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (!chatImageBase64) {
                                  setStatusMsg({ type: 'error', content: '💡 请先点击对话框左下角回形针上传单品参考图！' });
                                  chatAttachmentRef.current?.click();
                                } else {
                                  handleChatSend(undefined, "生成一张服装卖点特写图");
                                }
                              }}
                              className="px-3 py-2 text-left bg-white dark:bg-slate-900 hover:bg-primary/5 dark:hover:bg-primary/10 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-primary transition-all flex items-center gap-2 shadow-sm"
                            >
                              <Sliders className="w-4 h-4 text-primary shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-extrabold text-[11px] truncate text-slate-700 dark:text-slate-200">✨ 3. 卖点细节特写 (Detail)</span>
                                <span className="text-[9px] text-slate-400 font-normal truncate">聚焦面料材质与裁剪特写</span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (!chatImageBase64) {
                                  setStatusMsg({ type: 'error', content: '💡 请先点击对话框左下角回形针上传单品参考图！' });
                                  chatAttachmentRef.current?.click();
                                } else {
                                  handleChatSend(undefined, "把服装融入特定的奢华背景中并生成");
                                }
                              }}
                              className="px-3 py-2 text-left bg-white dark:bg-slate-900 hover:bg-primary/5 dark:hover:bg-primary/10 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-primary transition-all flex items-center gap-2 shadow-sm"
                            >
                              <ImageIcon className="w-4 h-4 text-primary shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-extrabold text-[11px] truncate text-slate-700 dark:text-slate-200">🏞️ 4. 创意背景重构 (Scene)</span>
                                <span className="text-[9px] text-slate-400 font-normal truncate">自然植入多维商业环境</span>
                              </div>
                            </button>
                          </div>

                          {/* Parameters selectors inside message */}
                          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                                <span>画幅比例 (Ratio)</span>
                                <span className="text-[9px] text-primary bg-primary/10 px-1.5 rounded">当前: {chatConfig.aspectRatio || '3:4'}</span>
                              </div>
                              <div className="flex bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                {([
                                  { ratio: '1:1', label: '1:1 正方形' },
                                  { ratio: '3:4', label: '3:4 人像' },
                                  { ratio: '9:16', label: '9:16 竖屏' }
                                ] as const).map((opt) => (
                                  <button
                                    key={opt.ratio}
                                    type="button"
                                    onClick={() => {
                                      setChatConfig(prev => ({ ...prev, aspectRatio: opt.ratio }));
                                      if (!chatImageBase64) {
                                        setStatusMsg({ type: 'success', content: `尺寸已修改为 ${opt.ratio}。请上传图片并开始生成！` });
                                      } else {
                                        handleChatSend(undefined, `把输出尺寸切换为 ${opt.ratio}，并直接生成一张生图`);
                                      }
                                    }}
                                    className={`flex-1 py-1 text-[9px] font-black rounded-md transition-all ${
                                      chatConfig.aspectRatio === opt.ratio
                                        ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                    }`}
                                  >
                                    {opt.label.split(' ')[0]}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                                <span>清晰度分级 (Quality)</span>
                                <span className="text-[9px] text-primary bg-primary/10 px-1.5 rounded">当前: {chatResolution.toUpperCase()}</span>
                              </div>
                              <div className="flex bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                {([
                                  { res: '1k', label: '1K 标清' },
                                  { res: '2k', label: '2K 高清' },
                                  { res: '4k', label: '4K 超清' }
                                ] as const).map((opt) => (
                                  <button
                                    key={opt.res}
                                    type="button"
                                    onClick={() => {
                                      setChatResolution(opt.res);
                                      if (!chatImageBase64) {
                                        setStatusMsg({ type: 'success', content: `清晰度已修改为 ${opt.res.toUpperCase()}。请上传图片并开始生成！` });
                                      } else {
                                        handleChatSend(undefined, `使用 ${opt.res.toUpperCase()} 清晰度，并直接生成一张生图`);
                                      }
                                    }}
                                    className={`flex-1 py-1 text-[9px] font-black rounded-md transition-all ${
                                      chatResolution === opt.res
                                        ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                    }`}
                                  >
                                    {opt.label.split(' ')[0]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0 self-start font-black text-[10px]">
                        ME
                      </div>
                    )}
                  </div>
                );
                })}

                {isChatLoading && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 self-start animate-spin">
                      <Loader2 className="w-4 h-4" />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 text-slate-400 p-5 rounded-[24px] rounded-tl-none border border-slate-100 dark:border-slate-800 text-sm flex items-center gap-2">
                      <span className="animate-pulse">FashionAI 正在构思和渲染，请稍候...</span>
                    </div>
                  </div>
                )}

                <div ref={chatScrollRef} />
              </div>

              {/* Chat Input & Config Controls */}
              <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <form onSubmit={handleChatSend} className="relative flex items-center gap-3">
                  {/* Prepared multi-images thumbnail drawer */}
                  {chatImages.length > 0 && (
                    <div className="absolute left-4 -top-24 p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-3 duration-300 overflow-x-auto max-w-[calc(100%-2rem)] z-20">
                      {chatImages.map((imgData, idx) => (
                        <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border group shrink-0">
                          <img src={imgData} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setChatImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-0.5 right-0.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                            title="删除此图"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex flex-col pr-2 justify-center shrink-0">
                        <span className="text-[10px] font-black text-slate-700 dark:text-slate-300">
                          已准备 {chatImages.length} 张图片
                        </span>
                        <span className="text-[8px] text-slate-400">将作为参考图共同上传</span>
                      </div>
                    </div>
                  )}

                  <button 
                    type="button" 
                    onClick={() => chatAttachmentRef.current?.click()}
                    className="p-2.5 text-slate-400 hover:text-primary rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    title="添加服装图片 (支持多张)"
                  >
                    <Upload className="w-5 h-5" />
                  </button>
                  <input 
                    type="file" 
                    ref={chatAttachmentRef} 
                    className="hidden" 
                    accept="image/*" 
                    multiple
                    onChange={handleChatAttachment} 
                  />

                  <input 
                    type="text" 
                    className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-xs sm:text-sm placeholder:text-slate-300 font-medium"
                    placeholder={imageBase64 || chatImages.length > 0 ? "例如: '我想做一张沙滩上的模特场景图'..." : "请点击回形针先上传一件或多张服装原图..."}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isChatLoading}
                  />
                  
                  <button 
                    type="submit" 
                    disabled={isChatLoading || (!chatInput.trim() && chatImages.length === 0)}
                    className="px-5 py-2.5 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-primary/95 shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all flex items-center gap-2 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    发送
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {activeChatPreviewUrl && (
          <div 
            className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
            onClick={() => setActiveChatPreviewUrl('')}
          >
            <div className="relative max-w-[95vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <img 
                src={activeChatPreviewUrl} 
                alt="FashionAI Generated Outcome Preview" 
                className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-300" 
              />
              
              <Button 
                variant="secondary"
                size="icon"
                className="absolute -top-4 -right-4 md:top-6 md:right-6 w-12 h-12 rounded-full shadow-2xl border border-white/10 backdrop-blur-md bg-black/40 hover:bg-black/60 text-white transition-all hover:scale-105 z-[130]"
                onClick={() => setActiveChatPreviewUrl('')}
              >
                <X className="w-6 h-6" />
              </Button>
            </div>

            <div className="mt-8 flex items-center gap-4 z-[130]" onClick={(e) => e.stopPropagation()}>
              <a 
                href={activeChatPreviewUrl} 
                download={`fashion_ai_${Date.now()}.jpg`}
                className="px-6 py-3 bg-primary text-white font-black text-sm uppercase tracking-wider rounded-2xl hover:bg-primary/95 shadow-xl shadow-primary/25 transition-all flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                下载超清原图
              </a>
              <Button 
                variant="outline"
                onClick={() => setActiveChatPreviewUrl('')}
                className="px-6 py-3 border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-850 transition-all"
              >
                关闭预览
              </Button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function ResultCard({ type, imgSrc, analysis, userId, toolId, config }: { type: string; imgSrc?: string; analysis: AnalysisData; userId: string; toolId: string; config: PromptConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoDownloadUrl, setVideoDownloadUrl] = useState<string>('');
  
  const [tConf, setTConf] = useState<TextOverlayConfig>({
    mainTitle: analysis?.productName || '时尚新品',
    subTitle: analysis?.style || '典雅风格',
    price: '¥299',
    promoBadge: 'NEW',
    detailInfo: [analysis.productName, analysis.materials, analysis.style, analysis.season].filter(Boolean) as string[],
    sellingPointTexts: analysis.sellingPoints || ['精选用料', '匠心工艺'],
    sceneTitle: analysis.brandName || 'FASHION BRAND',
    sceneSubtitle: analysis.posterTheme || '探索无限可能'
  });

  const labels: Record<string, string> = {
    main: '商品主图 (Square)',
    detail: '细节展示 (Detail)',
    sellingPoint: '卖点海报 (Hero)',
    scene: '氛围场景 (Lifestyle)'
  };

  const [previewUrl, setPreviewUrl] = useState<string>('');

  const drawCanvas = useCallback(() => {
    if (!imgSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      drawTextOverlay(canvas, type, tConf);
      setPreviewUrl(canvas.toDataURL());
    };
    img.src = imgSrc;
  }, [imgSrc, type, tConf]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleGenerateVideo = async () => {
    if (!imgSrc || !canvasRef.current) return;
    setIsVideoGenerating(true);
    setVideoUrl(''); // Reset previous video
    setVideoDownloadUrl('');
    try {
      // Create a temporary canvas to draw the raw image WITHOUT any text overlays
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D context');

      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      const cleanImgData = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          resolve(tempCanvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => {
          reject(new Error('Failed to load raw image to generate video'));
        };
        img.src = imgSrc;
      });

      const { videoUrl, downloadUrl } = await generateVideo(cleanImgData, userId, toolId, analysis, config);
      setVideoUrl(videoUrl);
      setVideoDownloadUrl(downloadUrl);
    } catch (err: any) {
      console.error('Video generation failed', err);
      alert(`视频生成失败: ${err.message}`);
    } finally {
      setIsVideoGenerating(false);
    }
  };

  const downloadImage = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `${type}-master.png`;
      link.href = canvasRef.current.toDataURL();
      link.click();
    }
  };

  return (
    <div className={`transition-all duration-700 flex flex-col lg:flex-row gap-8 items-start justify-center ${(isVideoGenerating || videoUrl) ? 'max-w-6xl' : 'max-w-lg'} mx-auto mb-20`}>
      {/* Image Card Container */}
      <div className="w-full max-w-lg animate-in zoom-in-95 duration-700">
        <div className="bg-white dark:bg-slate-900 rounded-[48px] p-4 shadow-2xl shadow-slate-200 dark:shadow-black/50 border border-slate-100 dark:border-slate-800">
          <div className="aspect-[3/4] relative rounded-[40px] overflow-hidden bg-slate-50 dark:bg-slate-950 group">
            {imgSrc ? (
              <>
                <canvas ref={canvasRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-center gap-6 backdrop-blur-sm">
                  <div className="flex gap-4">
                    <Button size="icon" variant="secondary" className="w-14 h-14 rounded-2xl shadow-xl shadow-black/20" onClick={() => setIsPreviewOpen(true)}>
                      <Maximize2 className="w-6 h-6" />
                    </Button>
                    <Button size="icon" variant="secondary" className="w-14 h-14 rounded-2xl shadow-xl shadow-black/20" onClick={() => setIsEditOpen(true)}>
                      <Edit2 className="w-6 h-6" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="secondary" 
                      className="w-14 h-14 rounded-2xl shadow-xl shadow-black/20 overflow-hidden relative group/btn" 
                      disabled={isVideoGenerating}
                      onClick={handleGenerateVideo}
                    >
                      {isVideoGenerating ? (
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      ) : (
                        <Video className="w-6 h-6 group-hover/btn:scale-110 transition-transform" />
                      )}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 w-full px-12">
                    <Button variant="default" className="rounded-full w-full h-12 font-bold shadow-xl shadow-primary/20" onClick={downloadImage}>
                      <Download className="w-4 h-4 mr-2" />
                      下载最终成品
                    </Button>
                    {type === 'scene' && (
                      <Button 
                        variant="secondary" 
                        className="rounded-full w-full h-12 font-bold shadow-xl shadow-black/10 bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-md"
                        disabled={isVideoGenerating}
                        onClick={handleGenerateVideo}
                      >
                        {isVideoGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            正在生成展示视频...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2 fill-current" />
                            生成产品展示视频
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
                </div>
                <span className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-slate-300 animate-pulse">正在渲染中</span>
              </div>
            )}
          </div>
          
          <div className="py-6 px-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-1 leading-none">画布类型</span>
              <span className="text-xl font-black tracking-tight">{labels[type]}</span>
            </div>
            <div className="bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
              <span className="text-[10px] font-black text-primary uppercase tracking-widest">Premium Output</span>
            </div>
          </div>
        </div>
      </div>

      {/* Side Video Panel */}
      {(isVideoGenerating || videoUrl) && (
        <div className="w-full max-w-lg lg:mt-0 animate-in slide-in-from-right-20 duration-700">
          <div className="bg-slate-900 rounded-[48px] p-4 shadow-2xl shadow-black/50 border border-slate-800 overflow-hidden">
            <div className="aspect-[3/4] relative rounded-[40px] overflow-hidden bg-black flex flex-col items-center justify-center">
              {videoUrl ? (
                <>
                  <video 
                    src={videoUrl} 
                    autoPlay 
                    loop 
                    muted 
                    playsInline 
                    controls 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-6 left-6 z-10">
                    <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-xl rounded-full border border-white/10">
                       <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                       <span className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Video Rendered</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 text-white">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <Video className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
                  </div>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mt-2">Veo 引擎渲染中</p>
                  <p className="text-[10px] text-slate-500 max-w-[200px] text-center leading-relaxed">
                    正在基于光影追踪进行动态视频合成，这可能需要 30-60 秒...
                  </p>
                </div>
              )}
            </div>

            <div className="py-6 px-4 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 leading-none">渲染引擎</span>
                <span className="text-xl font-black tracking-tight text-white">Google Veo 3.1</span>
              </div>
              {videoUrl && (
                <Button 
                  size="icon"
                  className="w-12 h-12 rounded-full shadow-xl shadow-primary/20" 
                  onClick={() => window.open(`${videoDownloadUrl || videoUrl}&download=1`, '_blank')}
                >
                  <Download className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
          
          {videoUrl && (
            <div className="mt-6 p-6 bg-primary/10 rounded-3xl border border-primary/20 animate-in fade-in slide-in-from-top-2">
              <h4 className="text-sm font-bold text-primary mb-1">生成成功！</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                动态视频已合成完毕。您可以保存此 5 秒的产品展示样片用于社交媒体投放。
              </p>
            </div>
          )}
        </div>
      )}

      {isPreviewOpen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh] w-auto h-auto flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {imgSrc && (
              <img 
                src={previewUrl || imgSrc} 
                alt="Preview" 
                className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-300" 
              />
            )}
            <Button 
              variant="secondary"
              size="icon"
              className="absolute -top-4 -right-4 md:top-6 md:right-6 w-12 h-12 rounded-full shadow-2xl border border-white/10 backdrop-blur-md bg-black/40 hover:bg-black/60 text-white transition-all hover:scale-105 z-[110]"
              onClick={() => setIsPreviewOpen(false)}
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-black tracking-tight">内容排版微调</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2 max-h-[60vh] overflow-y-auto pr-4 scrollbar-hide">
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">基础信息</h4>
              <EditableTextField label="主标题" value={tConf.mainTitle} onChange={(v) => setTConf({...tConf, mainTitle: v})} />
              <EditableTextField label="副标题" value={tConf.subTitle} onChange={(v) => setTConf({...tConf, subTitle: v})} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">价格策略</h4>
                <EditableTextField label="价格" value={tConf.price} onChange={(v) => setTConf({...tConf, price: v})} />
              </div>
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">促销标识</h4>
                <EditableTextField label="徽标" value={tConf.promoBadge} onChange={(v) => setTConf({...tConf, promoBadge: v})} />
              </div>
            </div>

            {type === 'detail' && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">参数面板</h4>
                <EditableTextField 
                  label="详情列表 (逗号分隔)" 
                  value={tConf.detailInfo.join(', ')} 
                  onChange={(v) => setTConf({...tConf, detailInfo: v.split(',').map(s=>s.trim())})} 
                />
              </div>
            )}
            
            {type === 'sellingPoint' && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">卖点内容</h4>
                <EditableTextField 
                  label="核心卖点 (逗号分隔)" 
                  value={tConf.sellingPointTexts.join(', ')} 
                  onChange={(v) => setTConf({...tConf, sellingPointTexts: v.split(',').map(s=>s.trim())})} 
                />
              </div>
            )}
            
            {type === 'scene' && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">品牌心智</h4>
                <EditableTextField label="品牌名" value={tConf.sceneTitle} onChange={(v) => setTConf({...tConf, sceneTitle: v})} />
                <EditableTextField label="品牌 Slogan" value={tConf.sceneSubtitle} onChange={(v) => setTConf({...tConf, sceneSubtitle: v})} />
              </div>
            )}
          </div>
          <div className="flex justify-end pt-8 mt-4 border-t">
            <Button onClick={() => setIsEditOpen(false)} className="rounded-full px-10 h-12 font-bold shadow-lg shadow-primary/20">
              更新排版预览
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
