
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, LayoutDashboard, AlertCircle, Play, Globe, Plus, FileJson, BookOpen, PanelLeft, Trash2, Check, X, Square, Figma } from 'lucide-react';
import ImageUploader from './components/ImageUploader';
import ImageWorkspace from './components/ImageWorkspace';
import AnalysisResult from './components/AnalysisResult';
import { ConfirmationModal } from './components/ConfirmationModal';
import { analyzeImage } from './services/geminiService';
import { ParsedAnalysis, Language, SelectionRect, Screenshot, ProjectContext, TaggingEvent, OverlayAnnotation, ScreenAnalysis, ViewState } from './types';
import { getTexts } from './utils/localization';

const DATA_PLAYBOOK_URL = "https://frill-purchase-4a6.notion.site/2cd425944d448013a824ccde7dfdc93d";
const INTERNAL_STORAGE_KEY = "is_internal_user";

// Helper to convert Base64 DataURL to File object
const dataUrlToFile = (dataUrl: string, fileName: string): File | null => {
  try {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], fileName, { type: mime });
  } catch (e) {
    console.error("Failed to convert dataUrl to File:", e);
    return null;
  }
};

const App: React.FC = () => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [activeScreenshotId, setActiveScreenshotId] = useState<string | null>(null);
  
  const [isInternalUser, setIsInternalUser] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(INTERNAL_STORAGE_KEY) === "true";
    }
    return false;
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<Record<string, SelectionRect>>({});
  
  const [results, setResults] = useState<Record<string, ScreenAnalysis>>({});
  const [screenContexts, setScreenContexts] = useState<Record<string, ProjectContext>>({});
  const [viewStates, setViewStates] = useState<Record<string, ViewState>>({});
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalyzingId, setCurrentAnalyzingId] = useState<string | null>(null);
  const [canceledIds, setCanceledIds] = useState<Set<string>>(new Set());
  
  const [analysisFeedback, setAnalysisFeedback] = useState<string | null>(null);
  const [hoveredItemNo, setHoveredItemNo] = useState<number | null>(null);
  
  const analysisController = useRef<AbortController | null>(null);
  const [analyzingDots, setAnalyzingDots] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('ko');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1280 : true);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [screenshotDeleteId, setScreenshotDeleteId] = useState<string | null>(null);
  const [figmaNotice, setFigmaNotice] = useState<string | null>(null);
  
  const t = getTexts(language);

  const processNewScreenshots = useCallback((newItems: Screenshot[]) => {
    setScreenshots(prev => {
      const updated = [...prev, ...newItems];
      if (prev.length === 0 && newItems.length > 0) {
        setActiveScreenshotId(newItems[0].id);
        setSelectedIds(new Set([newItems[0].id]));
      }
      return updated;
    });

    setScreenContexts(prev => {
      const next = { ...prev };
      newItems.forEach(s => {
        if (!next[s.id]) next[s.id] = { customRules: '', existingTags: '' };
      });
      return next;
    });
  }, []);

  // Shared ingestion handler for both manual upload and Figma import
  const handleImagesSelected = useCallback((files: File[]) => {
    setScreenshots(prevScreenshots => {
      const startCount = prevScreenshots.length;
      const newScreenshotPromises: Promise<Screenshot>[] = files.map((file, index) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
             const sequentialId = `A${(startCount + index + 1).toString().padStart(4, '0')}`;
             resolve({
               id: sequentialId,
               name: file.name,
               base64: e.target?.result as string
             });
          };
          reader.readAsDataURL(file);
        });
      });
      
      Promise.all(newScreenshotPromises).then(loaded => {
        processNewScreenshots(loaded);
      });
      
      return prevScreenshots; // Screenshots state is updated in the .then() block
    });
  }, [processNewScreenshots]);

  // Handle Figma Communication (type: UI2GA_IMPORT_IMAGE_BASE64)
  useEffect(() => {
    const handleFigmaImport = (event: MessageEvent) => {
      // Validate by message type and structure only (origin may be "null")
      if (event.data && event.data.type === "UI2GA_IMPORT_IMAGE_BASE64") {
        const { payload } = event.data;
        const dataUrl = payload?.dataUrl;
        const screenshotName = payload?.screenshotName || `Figma_${Date.now()}`;

        if (!dataUrl || !dataUrl.startsWith('data:image')) {
          console.error("Invalid Figma payload received:", payload);
          setFigmaNotice("Import failed: Invalid image data");
          setTimeout(() => setFigmaNotice(null), 3000);
          return;
        }

        const file = dataUrlToFile(dataUrl, screenshotName);
        if (file) {
          console.log("Figma Import Success:", screenshotName);
          handleImagesSelected([file]);
          setFigmaNotice(language === 'ko' ? "Figma에서 이미지를 가져왔습니다" : "Imported from Figma");
          setTimeout(() => setFigmaNotice(null), 3000);
        }
      }
    };

    window.addEventListener("message", handleFigmaImport);
    return () => window.removeEventListener("message", handleFigmaImport);
  }, [handleImagesSelected, language]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('org') === 'n2') {
      setIsInternalUser(true);
      localStorage.setItem(INTERNAL_STORAGE_KEY, "true");
    }
  }, []);

  // Handle Legacy/Alternative Figma Message format if applicable
  useEffect(() => {
    const handleFigmaMessage = (event: MessageEvent) => {
      const { pluginMessage } = event.data;
      if (!pluginMessage) return;
      if (pluginMessage.type === 'UI2GA_FIGMA_IMAGE') {
        const { data, name } = pluginMessage;
        const sequentialId = `F${(screenshots.length + 1).toString().padStart(4, '0')}`;
        const newScreenshot: Screenshot = {
          id: sequentialId,
          name: name || 'Figma Frame',
          base64: data.startsWith('data:') ? data : `data:image/png;base64,${data}`
        };
        processNewScreenshots([newScreenshot]);
      }
    };
    window.addEventListener('message', handleFigmaMessage);
    return () => window.removeEventListener('message', handleFigmaMessage);
  }, [screenshots.length, processNewScreenshots]);

  const activeContext = activeScreenshotId 
    ? screenContexts[activeScreenshotId] || { customRules: '', existingTags: '' } 
    : { customRules: '', existingTags: '' };

  const activeSelection = activeScreenshotId ? selections[activeScreenshotId] : undefined;

  useEffect(() => {
    let interval: number;
    if (isAnalyzing) {
      interval = window.setInterval(() => {
        setAnalyzingDots(prev => prev.length >= 3 ? '' : prev + '•');
      }, 500);
    } else {
      setAnalyzingDots('');
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  useEffect(() => {
    setHoveredItemNo(null);
  }, [activeScreenshotId]);

  const handleSelectionChange = (rect: SelectionRect | undefined) => {
      if (!activeScreenshotId) return;
      setSelections(prev => {
          if (!rect) {
              const next = { ...prev };
              delete next[activeScreenshotId];
              return next;
          }
          return { ...prev, [activeScreenshotId]: rect };
      });
  };

  const handleContextChange = (field: keyof ProjectContext, value: string) => {
      if (!activeScreenshotId) return;
      setScreenContexts(prev => ({
          ...prev,
          [activeScreenshotId]: {
              ...(prev[activeScreenshotId] || { customRules: '', existingTags: '' }),
              [field]: value
          }
      }));
  };

  const toggleSelection = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === screenshots.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(screenshots.map(s => s.id)));
      }
  };

  const handleAnalyze = async () => {
    if (isAnalyzing) {
        if (analysisController.current) {
            analysisController.current.abort();
        }
        return;
    }
    if (selectedIds.size === 0) return;

    setIsAnalyzing(true);
    setError(null);
    setAnalysisFeedback(null);
    
    const ac = new AbortController();
    analysisController.current = ac;
    const targets = screenshots.filter(s => selectedIds.has(s.id));
    const processedIds = new Set<string>();

    setCanceledIds(prev => {
      const next = new Set(prev);
      targets.forEach(t => next.delete(t.id));
      return next;
    });

    try {
      for (const target of targets) {
          if (ac.signal.aborted) break;
          setCurrentAnalyzingId(target.id);
          const context = screenContexts[target.id] || { customRules: '', existingTags: '' };
          const targetSelection = selections[target.id];

          try {
              const response = await analyzeImage(
                  [target],
                  language, 
                  context,
                  results, 
                  target.id, 
                  targetSelection,
                  ac.signal
              );
              if (ac.signal.aborted) break;
              if (response.results && response.results[target.id]) {
                   const data = response.results[target.id];
                   setResults(prev => {
                       const next = { ...prev };
                       next[target.id] = data;
                       return next;
                   });
                   processedIds.add(target.id);
              }
          } catch (e: any) {
              if (e.name === 'AbortError' || ac.signal.aborted) break;
              
              if (e.message === "MISSING_API_KEY") {
                  throw new Error(language === 'ko' ? "API 키 설정이 누락되었습니다. 환경 변수를 확인해주세요." : "API Key is missing. Please check environment variables.");
              }
              console.error(e);
          }
          setCurrentAnalyzingId(null);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
          setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setIsAnalyzing(false);
      setCurrentAnalyzingId(null);
      if (analysisController.current?.signal.aborted) {
          setCanceledIds(prev => {
              const next = new Set(prev);
              targets.forEach(t => { if (!processedIds.has(t.id)) next.add(t.id); });
              return next;
          });
          const msg = t.canceledStatus
            .replace('{completed}', processedIds.size.toString())
            .replace('{total}', targets.length.toString());
          setAnalysisFeedback(msg);
      }
      analysisController.current = null;
    }
  };

  const handleResetClick = () => setIsResetModalOpen(true);
  const confirmReset = () => {
    setScreenshots([]); setActiveScreenshotId(null); setSelectedIds(new Set()); setResults({}); setSelections({}); setScreenContexts({}); setViewStates({}); setCanceledIds(new Set()); setError(null); setIsAnalyzing(false); setAnalysisFeedback(null); setIsResetModalOpen(false);
  };
  const cancelReset = () => setIsResetModalOpen(false);

  const handleDeleteScreenshot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setScreenshots(prev => prev.filter(s => s.id !== id));
    setResults(prev => { const next = { ...prev }; delete next[id]; return next; });
    setScreenContexts(prev => { const next = { ...prev }; delete next[id]; return next; });
    setViewStates(prev => { const next = { ...prev }; delete next[id]; return next; });
    setSelections(prev => { const next = { ...prev }; delete next[id]; return next; });
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    setCanceledIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    if (activeScreenshotId === id) setActiveScreenshotId(null);
    setScreenshotDeleteId(null);
  };

  const handleDeleteRow = (itemNo: number) => {
      if (!activeScreenshotId || !results[activeScreenshotId]) return;
      const current = results[activeScreenshotId];
      const remainingEvents = current.events.filter(e => e.item_no !== itemNo);
      remainingEvents.sort((a, b) => a.item_no - b.item_no);
      const newEvents: TaggingEvent[] = [];
      const newAnns: OverlayAnnotation[] = [];
      const idMap = new Map<number, number>();
      remainingEvents.forEach((e, idx) => {
          const newId = idx + 1;
          idMap.set(e.item_no, newId);
          newEvents.push({ ...e, item_no: newId });
      });
      current.annotations.forEach(a => { if (idMap.has(a.item_no)) newAnns.push({ ...a, item_no: idMap.get(a.item_no)! }); });
      setResults(prev => ({ ...prev, [activeScreenshotId]: { events: newEvents, annotations: newAnns } }));
  };

  const handleUpdateEvent = useCallback((itemNo: number, field: keyof TaggingEvent, value: string) => {
    if (!activeScreenshotId || !results[activeScreenshotId]) return;
    setResults(prev => {
      const current = prev[activeScreenshotId];
      const updatedEvents = current.events.map(e => e.item_no === itemNo ? { ...e, [field]: field === 'item_no' ? parseInt(value) || e.item_no : value } : e);
      return { ...prev, [activeScreenshotId]: { ...current, events: updatedEvents } };
    });
  }, [activeScreenshotId]);

  const handleUpdateEvents = useCallback((events: TaggingEvent[]) => {
    if (!activeScreenshotId || !results[activeScreenshotId]) return;
    setResults(prev => ({ ...prev, [activeScreenshotId]: { ...prev[activeScreenshotId], events: events } }));
  }, [activeScreenshotId]);

  const handleAddRow = () => {
      if (!activeScreenshotId) return;
      const current = results[activeScreenshotId] || { events: [], annotations: [] };
      const newId = current.events.length + 1;
      const newEvent: TaggingEvent = {
          item_no: newId,
          event_category: current.events.length > 0 ? current.events[current.events.length - 1].event_category : 'category',
          event_action: 'new_action',
          event_label: '(not_set)',
          description: language === 'ko' ? '새로 추가된 이벤트' : 'New added event'
      };
      setResults(prev => ({ ...prev, [activeScreenshotId]: { ...current, events: [...current.events, newEvent] } }));
  };

  const handleAddAnnotation = (rect: SelectionRect) => {
       if (!activeScreenshotId) return;
       const current = results[activeScreenshotId] || { events: [], annotations: [] };
       const newId = current.events.length + 1;
       const newEvent: TaggingEvent = {
           item_no: newId,
           event_category: current.events.length > 0 ? current.events[current.events.length - 1].event_category : 'category',
           event_action: 'click_custom',
           event_label: '(not_set)',
           description: language === 'ko' ? '사용자 정의 영역' : 'User defined area'
       };
       const newAnn: OverlayAnnotation = { item_no: newId, label: 'click_custom', bbox: rect, confidence: 1, display_priority: 1 };
       setResults(prev => ({ ...prev, [activeScreenshotId]: { events: [...current.events, newEvent], annotations: [...current.annotations, newAnn] } }));
  };

  const handleViewStateChange = (state: ViewState) => { if (activeScreenshotId) setViewStates(prev => ({ ...prev, [activeScreenshotId]: state })); };

  const activeImage = screenshots.find(s => s.id === activeScreenshotId);
  const activeResult = activeScreenshotId ? results[activeScreenshotId] : undefined;
  const activeViewState = activeScreenshotId ? viewStates[activeScreenshotId] : undefined;
  const canAnalyze = selectedIds.size > 0;
  
  const getAnalyzeSummary = () => {
    if (selectedIds.size === 0) return t.noSelection;
    let partial = 0; let full = 0;
    selectedIds.forEach(id => { if (selections[id]) partial++; else full++; });
    return t.analyzeSummary.replace('{total}', selectedIds.size.toString()).replace('{partial}', partial.toString()).replace('{full}', full.toString());
  };

  return (
    <div className="h-screen bg-[#f8f9fb] flex flex-col font-sans text-slate-900 overflow-hidden relative">
      <ConfirmationModal
        isOpen={isResetModalOpen}
        message={language === 'ko' ? "현재 작업 중인 모든 데이터가 삭제되고 홈 화면으로 돌아갑니다. 계속하시겠습니까?" : "All current work will be deleted and you will be returned to the home screen. Do you want to proceed?"}
        confirmText={language === 'ko' ? "네" : "Yes"}
        cancelText={language === 'ko' ? "아니오" : "No"}
        onConfirm={confirmReset}
        onCancel={cancelReset}
      />

      {figmaNotice && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-[#4f46e5] text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/20 backdrop-blur-sm">
            <Figma className="w-5 h-5 fill-current" />
            <span className="text-sm font-bold">{figmaNotice}</span>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 h-14 px-5 flex items-center justify-between shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
            {screenshots.length > 0 && (
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 rounded-lg transition-colors mr-1 ${isSidebarOpen ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}><PanelLeft className="w-5 h-5" /></button>
            )}
            <div className="bg-[#4f46e5] w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"><LayoutDashboard className="w-5 h-5 text-white" /></div>
            <div>
                <h1 className="text-sm font-bold text-slate-900 leading-none">{t.title}</h1>
                <p className="text-[10px] text-slate-500 font-medium mt-1">{t.subtitle}</p>
            </div>
        </div>
        
        <div className="flex items-center gap-4">
           {isInternalUser && (
             <a href={DATA_PLAYBOOK_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[11px] font-bold text-slate-600 hover:text-[#4f46e5] transition-colors"><BookOpen className="w-4 h-4" />데이터 플레이북</a>
           )}

           <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
             <Globe className="w-3.5 h-3.5 text-slate-400" />
             <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="bg-transparent text-[11px] font-bold text-slate-600 outline-none cursor-pointer">
               <option value="ko">한국어 (Korean)</option>
               <option value="en">English</option>
             </select>
           </div>

           {screenshots.length > 0 && (
             <button onClick={handleResetClick} className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 flex items-center">{t.reset}</button>
           )}
        </div>
      </header>

      <div className="absolute bottom-2 right-4 z-0 pointer-events-none mix-blend-multiply opacity-50 select-none">
        <p className="text-[10px] text-slate-400 font-medium">© 2025 Sangjin Lee / UI2GA. Personal Project.</p>
      </div>

      <main className="flex-1 overflow-hidden relative z-10">
        {screenshots.length === 0 ? (
          <div className="max-w-4xl mx-auto px-6 py-20 flex flex-col items-center overflow-y-auto h-full">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">{t.uploadTitle}</h2>
              <p className="text-slate-500 max-w-xl mx-auto">{t.uploadDesc}</p>
            </div>
            <div className="w-full max-w-3xl"><ImageUploader onImagesSelected={handleImagesSelected} isLoading={isAnalyzing} language={language} /></div>
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><h4 className="font-bold text-slate-900 mb-2">{t.features.detection.title}</h4><p className="text-xs text-slate-500 leading-relaxed">{t.features.detection.desc}</p></div>
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><h4 className="font-bold text-slate-900 mb-2">{t.features.selection.title}</h4><p className="text-xs text-slate-500 leading-relaxed">{t.features.selection.desc}</p></div>
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><h4 className="font-bold text-slate-900 mb-2">{t.features.multi.title}</h4><p className="text-xs text-slate-500 leading-relaxed">{t.features.multi.desc}</p></div>
            </div>
          </div>
        ) : (
          <div className="flex h-full p-4 md:p-2 xl:p-4 pb-8 md:pb-8 xl:pb-8 overflow-hidden relative">
            <div className={`transition-all duration-300 ease-in-out flex flex-col gap-4 overflow-hidden h-full z-40 xl:relative xl:shrink-0 xl:bg-transparent xl:shadow-none xl:top-auto xl:left-auto xl:bottom-auto absolute top-4 left-4 bottom-4 md:top-2 md:left-2 md:bottom-2 shadow-2xl rounded-xl bg-[#f8f9fb] ${isSidebarOpen ? 'w-72 opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-full xl:translate-x-0 xl:w-0 pointer-events-none'} ${isSidebarOpen ? 'xl:mr-4' : 'xl:mr-0'}`}>
                <div className="w-72 flex flex-col gap-4 h-full shrink-0">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[40%]">
                        <div className="px-4 py-3 bg-white border-b border-slate-100 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <div onClick={toggleSelectAll} className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${selectedIds.size > 0 && selectedIds.size === screenshots.length ? 'bg-[#4f46e5] border-[#4f46e5]' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                                    {selectedIds.size > 0 && selectedIds.size === screenshots.length && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 tracking-tight">({selectedIds.size}/{screenshots.length})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-700">{t.screenshots}</span>
                                <label className="cursor-pointer"><Plus className="w-4 h-4 text-slate-400 hover:text-[#4f46e5]"/><input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && handleImagesSelected(Array.from(e.target.files))} /></label>
                            </div>
                        </div>
                        <div className="overflow-y-auto p-3 space-y-2 custom-scrollbar flex-1">
                            {screenshots.map((s) => (
                                <div key={s.id} onClick={() => setActiveScreenshotId(s.id)} className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer group relative ${activeScreenshotId === s.id ? 'border-[#4f46e5] bg-indigo-50/50 ring-1 ring-[#4f46e5]' : 'border-slate-100 hover:border-slate-300'}`}>
                                    <div onClick={(e) => { e.stopPropagation(); toggleSelection(s.id); }} className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center cursor-pointer transition-colors ${selectedIds.has(s.id) ? 'bg-[#4f46e5] border-[#4f46e5]' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                                        {selectedIds.has(s.id) && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                    </div>
                                    <div className="w-10 h-10 shrink-0 rounded bg-slate-100 border border-slate-200 overflow-hidden"><img src={s.base64} className="w-full h-full object-cover" alt="thumb" /></div>
                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className={`text-[11px] font-bold truncate ${activeScreenshotId === s.id ? 'text-[#4f46e5]' : 'text-slate-700'}`}>{s.name}</p>
                                        <div className="flex items-center gap-1.5"><p className="text-[9px] text-slate-400 font-bold font-mono tracking-wider">{s.id}</p></div>
                                    </div>
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                         {currentAnalyzingId === s.id ? <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse ring-2 ring-yellow-100" title="Analyzing..."></div> : canceledIds.has(s.id) ? <div className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-100" title="Canceled/Failed"></div> : results[s.id] ? <div className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-100" title="Completed"></div> : null}
                                    </div>
                                    <div className={`absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1 z-10 ${screenshotDeleteId === s.id ? 'flex' : 'hidden group-hover:flex'}`} onClick={(e) => e.stopPropagation()}>
                                        {screenshotDeleteId === s.id ? (
                                            <><button onClick={(e) => { e.stopPropagation(); setScreenshotDeleteId(null); }} className="p-1.5 bg-slate-200 rounded-md hover:bg-slate-300 text-slate-600 transition-colors"><X className="w-3 h-3" /></button><button onClick={(e) => { e.stopPropagation(); handleDeleteScreenshot(s.id, e); }} className="p-1.5 bg-red-500 rounded-md hover:bg-red-600 text-white transition-colors"><Check className="w-3 h-3" /></button></>
                                        ) : (
                                            <button onClick={(e) => { e.stopPropagation(); setScreenshotDeleteId(s.id); }} className="p-1.5 bg-white/80 backdrop-blur rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 shadow-sm transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0"><span className="text-xs font-bold text-slate-700 flex items-center gap-2"><FileJson className="w-4 h-4 text-slate-400"/> {t.contextRules}</span></div>
                        <div className="p-4 flex flex-col gap-5 overflow-y-auto custom-scrollbar flex-1">
                            <div className="flex flex-col gap-1.5"><label className="text-[11px] font-bold text-slate-700">{t.customRulesTitle}</label><textarea className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none resize-none h-24 bg-white text-slate-800 placeholder:text-slate-300" placeholder={t.customRulesPlaceholder} value={activeContext.customRules} onChange={(e) => handleContextChange('customRules', e.target.value)} /></div>
                            <div className="flex flex-col gap-1.5"><label className="text-[11px] font-bold text-slate-700">{t.existingTagsTitle}</label><textarea className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none resize-none h-24 bg-white text-slate-800 placeholder:text-slate-300" placeholder={t.existingTagsPlaceholder} value={activeContext.existingTags} onChange={(e) => handleContextChange('existingTags', e.target.value)} /></div>
                        </div>
                    </div>
                </div>
            </div>
            {isSidebarOpen && <div className="absolute inset-0 z-30 bg-transparent xl:hidden" onClick={() => setIsSidebarOpen(false)} />}
            <div className="flex-1 flex gap-4 md:gap-2 xl:gap-4 min-w-0 overflow-hidden">
                <div className="flex-1 flex flex-col gap-4 md:gap-2 xl:gap-4 min-w-0 overflow-hidden">
                    <div className="flex justify-between items-center bg-white h-14 px-6 md:px-3 xl:px-6 rounded-xl border border-slate-200 shadow-sm shrink-0">
                        <span className={`text-xs font-medium truncate ${selectedIds.size === 0 ? 'text-red-500' : 'text-slate-600'}`}>{analysisFeedback || getAnalyzeSummary()}</span>
                        <button onClick={handleAnalyze} disabled={!canAnalyze && !isAnalyzing} className={`flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-bold text-sm text-white transition-all shrink-0 w-48 ${isAnalyzing ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200 shadow-sm' : canAnalyze ? 'bg-[#4f46e5] hover:bg-indigo-700 active:scale-95 shadow-indigo-200 shadow-sm' : 'bg-slate-300 cursor-not-allowed'}`}>
                            {isAnalyzing ? <><Square className="w-3 h-3 fill-current" /><span>{t.analyzingBtn}</span><span className="w-4 text-left inline-block">{analyzingDots}</span></> : <><Play className="w-4 h-4 fill-current" /><span>{t.analyzeBtn}</span></>}
                        </button>
                    </div>
                    <div className="flex-1 bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200 relative">
                        {activeImage ? <ImageWorkspace key={activeImage.id} imageData={activeImage.base64} overlayData={activeResult ? { screenshot_id: activeImage.id, annotations: activeResult.annotations } : null} onSelectionChange={handleSelectionChange} onAddAnnotation={handleAddAnnotation} selection={activeSelection} language={language} activeScreenshotId={activeScreenshotId} savedViewState={activeViewState} onViewStateChange={handleViewStateChange} onHoverItem={setHoveredItemNo} /> : <div className="flex items-center justify-center h-full text-slate-300 font-bold">No Image Selected</div>}
                    </div>
                </div>
                <div className="w-full md:w-[480px] xl:w-[600px] shrink-0 h-full overflow-hidden">
                    {error ? <div className="bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center h-full p-10 text-center"><AlertCircle className="w-12 h-12 text-red-500 mb-4" /><h3 className="text-lg font-bold text-slate-800 mb-2">{t.analysisFailed}</h3><p className="text-slate-500 text-sm mb-6">{error}</p><button onClick={handleAnalyze} className="px-6 py-2 bg-[#4f46e5] text-white rounded-lg font-bold text-sm">{t.tryAgain}</button></div> : activeResult ? <AnalysisResult analysis={activeResult} language={language} onDeleteRow={handleDeleteRow} onUpdateEvent={handleUpdateEvent} onUpdateEvents={handleUpdateEvents} onAddRow={handleAddRow} activeScreenshotId={activeScreenshotId} activeImage={activeImage} hoveredItemNo={hoveredItemNo} /> : <div className="bg-white border-2 border-slate-200 border-dashed rounded-xl h-full flex flex-col items-center justify-center text-slate-400 p-10 text-center"><LayoutDashboard className="w-12 h-12 text-slate-100 mb-4" /><h3 className="text-base font-bold text-slate-800 mb-2">{t.ready}</h3><p className="text-xs max-w-xs">{t.readyDesc}</p></div>}
                </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
