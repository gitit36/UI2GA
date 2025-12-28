import React, { useRef, useState, useEffect } from 'react';
import { OverlayJSON, SelectionRect, Language, ViewState } from '../types';
import { Scan, X, Download, PlusCircle, RotateCcw, Hand } from 'lucide-react';
import { getTexts } from '../utils/localization';

interface ImageWorkspaceProps {
  imageData: string;
  overlayData: OverlayJSON | null;
  onSelectionChange: (rect: SelectionRect | undefined) => void;
  onAddAnnotation: (rect: SelectionRect) => void;
  selection: SelectionRect | undefined;
  language: Language;
  activeScreenshotId: string | null;
  savedViewState?: ViewState;
  onViewStateChange: (state: ViewState) => void;
  onHoverItem: (itemNo: number | null) => void;
}

const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({ 
  imageData, 
  overlayData, 
  onSelectionChange,
  onAddAnnotation,
  selection,
  language,
  activeScreenshotId,
  savedViewState,
  onViewStateChange,
  onHoverItem
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const prevContainerSize = useRef<{ width: number, height: number } | null>(null);
  
  // Initialize with saved state if available, otherwise defaults (will be overwritten by fitToScreen on load)
  const [zoom, setZoom] = useState(savedViewState?.zoom || 1);
  const [offset, setOffset] = useState(savedViewState?.offset || { x: 0, y: 0 });
  const [isHandToolActive, setIsHandToolActive] = useState(false);
  
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [currentPos, setCurrentPos] = useState<{x: number, y: number} | null>(null);
  
  const t = getTexts(language);
  const isAnnotationMode = !!overlayData;

  // Sync internal state with prop changes when switching screenshots
  useEffect(() => {
    if (savedViewState) {
      setZoom(savedViewState.zoom);
      setOffset(savedViewState.offset);
    }
    // Note: We don't depend on savedViewState alone to avoid loops, only when ID changes ideally
  }, [activeScreenshotId]); // Trigger when ID changes

  // Helper to update state and notify parent
  const updateViewState = (newZoom: number, newOffset: {x: number, y: number}, isManual: boolean = true) => {
    setZoom(newZoom);
    setOffset(newOffset);
    onViewStateChange({ zoom: newZoom, offset: newOffset, manual: isManual });
  };

  // Fit to screen calculation
  const fitToScreen = () => {
    if (!containerRef.current || !imgRef.current) return;
    const container = containerRef.current;
    const img = imgRef.current;
    
    const padding = 64; 
    const availableWidth = container.clientWidth - padding;
    const availableHeight = container.clientHeight - padding;
    
    const scaleX = availableWidth / img.naturalWidth;
    const scaleY = availableHeight / img.naturalHeight;
    
    const newZoom = Math.min(scaleX, scaleY, 1); 
    
    const newOffsetX = (container.clientWidth - img.naturalWidth * newZoom) / 2;
    const newOffsetY = (container.clientHeight - img.naturalHeight * newZoom) / 2;

    // Passing false for manual to indicate this is an auto-fit
    updateViewState(newZoom, { x: newOffsetX, y: newOffsetY }, false);
  };

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
        // Only fit to screen if we don't have a saved state OR the saved state was not manually adjusted
        if (!savedViewState || !savedViewState.manual) {
            fitToScreen();
        }
    }
  }, [imageData]); // Only run when image source changes

  // Auto-center on resize
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        
        if (prevContainerSize.current) {
          const deltaX = (newW - prevContainerSize.current.width) / 2;
          const deltaY = (newH - prevContainerSize.current.height) / 2;
          
          if (deltaX !== 0 || deltaY !== 0) {
             setOffset(prev => {
                const updated = { x: prev.x + deltaX, y: prev.y + deltaY };
                // Keep the current manual state when resizing
                onViewStateChange({ zoom, offset: updated, manual: savedViewState?.manual });
                return updated;
             });
          }
        }
        
        prevContainerSize.current = { width: newW, height: newH };
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [zoom, savedViewState?.manual]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpacePressed) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsSpacePressed(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const factor = e.deltaY < 0 ? 1.05 : 0.95;
    const newZoom = Math.min(Math.max(0.05, zoom * factor), 10);
    
    if (newZoom !== zoom) {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const imageX = (mouseX - offset.x) / zoom;
      const imageY = (mouseY - offset.y) / zoom;

      const newOffsetX = mouseX - imageX * newZoom;
      const newOffsetY = mouseY - imageY * newZoom;

      updateViewState(newZoom, { x: newOffsetX, y: newOffsetY }, true);
    }
  };

  const getNormalizedCoords = (e: React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.min(Math.max(0, x), 1),
      y: Math.min(Math.max(0, y), 1)
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed || isHandToolActive || e.button === 1) {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    const coords = getNormalizedCoords(e);
    setStartPos(coords);
    setCurrentPos(coords);
    setIsSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      const newOffset = { x: offset.x + dx, y: offset.y + dy };
      setOffset(newOffset); 
      setLastMousePos({ x: e.clientX, y: e.clientY });
      // Update with manual=true for panning
      onViewStateChange({ zoom, offset: newOffset, manual: true });
      return;
    }

    if (!isSelecting || !startPos) return;
    setCurrentPos(getNormalizedCoords(e));
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isSelecting || !startPos || !currentPos) {
      setIsSelecting(false);
      return;
    }

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    if (w > 0.005 && h > 0.005) {
        if (isAnnotationMode) onAddAnnotation({ x, y, w, h });
        else onSelectionChange({ x, y, w, h });
    } else if (!isAnnotationMode) {
        onSelectionChange(undefined);
    }

    setIsSelecting(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  const downloadAnnotatedImage = async () => {
    if (!imgRef.current || !overlayData) return;
    const canvas = document.createElement('canvas');
    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    
    overlayData.annotations.forEach(ann => {
        const x = ann.bbox.x * canvas.width;
        const y = ann.bbox.y * canvas.height;
        const w = ann.bbox.w * canvas.width;
        const h = ann.bbox.h * canvas.height;
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 8;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#ef4444';
        
        const fs = Math.max(48, Math.round(canvas.width * 0.03)); 
        ctx.font = `bold ${fs}px sans-serif`;
        const text = ann.item_no.toString();
        const textWidth = ctx.measureText(text).width;
        
        // Positioning Rule: Item 1 drops down, others go up
        if (ann.item_no === 1) {
            // Draw below top edge
            ctx.fillRect(x, y, textWidth + 32, fs + 16);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, x + 16, y + fs - 4);
        } else {
            // Draw above top edge (Original behavior)
            ctx.fillRect(x, y - fs - 16, textWidth + 32, fs + 16);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, x + 16, y - 20);
        }
    });
    
    const link = document.createElement('a');
    link.download = `annotated_${activeScreenshotId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const activeRect = isSelecting && startPos && currentPos
    ? {
        x: Math.min(startPos.x, currentPos.x),
        y: Math.min(startPos.y, currentPos.y),
        w: Math.abs(currentPos.x - startPos.x),
        h: Math.abs(currentPos.y - startPos.y)
      }
    : selection;

  const getCursor = () => {
    if (isPanning) return 'grabbing';
    if (isSpacePressed || isHandToolActive) return 'grab';
    return 'crosshair';
  };

  return (
    <div className="flex flex-col h-full bg-[#f3f5f9] relative select-none overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-10 px-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2">
          {isAnnotationMode ? <PlusCircle className="w-3.5 h-3.5 text-indigo-600"/> : <Scan className="w-3.5 h-3.5 text-gray-400" />}
          <span className={`text-[11px] font-bold ${isAnnotationMode ? 'text-indigo-600' : 'text-slate-400'}`}>
            {isAnnotationMode ? t.annotationMode : selection ? t.regionSelectedMsg : t.dragToSelect}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border-r border-gray-200 pr-4">
                <button onClick={() => updateViewState(Math.max(0.05, zoom * 0.9), offset)} className="p-1 hover:bg-gray-200 rounded text-slate-400 font-bold">-</button>
                <span className="text-[10px] font-bold text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => updateViewState(Math.min(10, zoom * 1.1), offset)} className="p-1 hover:bg-gray-200 rounded text-slate-400 font-bold">+</button>
                <button onClick={fitToScreen} className="p-1 hover:bg-gray-200 rounded ml-1 text-slate-400 hover:text-slate-600" title="Fit to Screen"><RotateCcw className="w-3 h-3"/></button>
            </div>

            {overlayData && (
                 <button onClick={downloadAnnotatedImage} className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold hover:text-gray-600 transition-all active:scale-95">
                    <Download className="w-3 h-3" /> {t.downloadAnnotated}
                 </button>
            )}
            
            {selection && !isAnnotationMode && (
                <button onClick={() => onSelectionChange(undefined)} className="text-[10px] text-red-400 font-bold hover:text-red-600 flex items-center gap-1">
                    <X className="w-3 h-3" /> {language === 'ko' ? '선택 취소' : 'Clear'}
                </button>
            )}
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-slate-200/50"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: getCursor() }}
      >
        <div 
          className="absolute transition-transform duration-75 ease-out"
          style={{ 
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <div className="relative">
            <img 
              ref={imgRef}
              src={imageData} 
              alt="UI Screenshot" 
              className="max-h-none max-w-none block shadow-2xl bg-white border border-slate-200"
              draggable={false}
              onLoad={fitToScreen}
            />
            
            {activeRect && (
              <div
                className={`absolute border-2 z-30 pointer-events-none ${isAnnotationMode ? 'border-green-500 bg-green-500/10' : 'border-[#4f46e5] bg-indigo-500/10'}`}
                style={{
                  left: `${activeRect.x * 100}%`,
                  top: `${activeRect.y * 100}%`,
                  width: `${activeRect.w * 100}%`,
                  height: `${activeRect.h * 100}%`,
                }}
              ></div>
            )}

            {overlayData?.annotations.map((ann) => {
              const isItemOne = ann.item_no === 1;
              return (
                <div
                  key={ann.item_no}
                  onMouseEnter={() => onHoverItem(ann.item_no)}
                  onMouseLeave={() => onHoverItem(null)}
                  className="absolute border-[4px] border-[#ef4444] z-20 group"
                  style={{
                    left: `${ann.bbox.x * 100}%`,
                    top: `${ann.bbox.y * 100}%`,
                    width: `${ann.bbox.w * 100}%`,
                    height: `${ann.bbox.h * 100}%`,
                  }}
                >
                  <div className={`absolute -left-[4px] min-w-[32px] h-[32px] bg-[#ef4444] text-white text-[16px] font-bold flex items-center justify-center shadow-sm px-1 ${
                    isItemOne ? 'top-0 rounded-b' : '-top-[32px] rounded-t'
                  }`}>
                    {ann.item_no}
                  </div>
                  
                  <div className="absolute -bottom-10 left-0 z-50 hidden group-hover:block whitespace-nowrap bg-slate-900 text-white text-[11px] px-2 py-1.5 rounded-lg shadow-xl pointer-events-none">
                    #{ann.item_no}: {ann.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Discreet Localized Hint Bar */}
      <div className="h-6 px-4 bg-white border-t border-slate-100 flex items-center justify-between shrink-0 z-30">
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            {t.shortcutHint}
          </span>
          <button 
             onClick={() => setIsHandToolActive(!isHandToolActive)}
             className={`p-1 rounded transition-colors ${isHandToolActive ? 'bg-[#4f46e5] text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
             title="Move / Hand Tool"
          >
             <Hand className="w-3 h-3" />
          </button>
      </div>
    </div>
  );
};

export default ImageWorkspace;