import React, { useState, useEffect } from 'react';
import { ScreenAnalysis, Language, TaggingEvent, Screenshot } from '../types';
import { getTexts } from '../utils/localization';
import { Copy, Table as TableIcon, Code, Download, Trash2, Plus, Figma, AlertCircle, Check } from 'lucide-react';

interface AnalysisResultProps {
  analysis: ScreenAnalysis;
  language: Language;
  onDeleteRow: (itemNo: number) => void;
  onUpdateEvent: (itemNo: number, field: keyof TaggingEvent, value: string) => void;
  onUpdateEvents: (events: TaggingEvent[]) => void;
  onAddRow: () => void;
  activeScreenshotId: string | null;
  activeImage?: Screenshot;
  hoveredItemNo: number | null;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({ 
  analysis, 
  language, 
  onDeleteRow, 
  onUpdateEvent,
  onUpdateEvents,
  onAddRow, 
  activeScreenshotId, 
  activeImage,
  hoveredItemNo
}) => {
  const [activeTab, setActiveTab] = useState<'table' | 'json'>('table');
  const [editingCell, setEditingCell] = useState<{ itemNo: number, field: keyof TaggingEvent } | null>(null);
  const [tempCellValue, setTempCellValue] = useState<string>("");
  const [jsonText, setJsonText] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'markdown' | 'json' | null>(null);
  const t = getTexts(language);

  // Sync JSON text when analysis changes (from outside)
  useEffect(() => {
    setJsonText(JSON.stringify({ events: analysis.events }, null, 2));
    setJsonError(null);
  }, [analysis]);

  const generateMarkdown = () => {
    const header = "| No | EVENTCATEGORY | EVENTACTION | EVENTLABEL | Description |\n|---|---|---|---|---|";
    const rows = analysis.events.map(e => 
      `| ${e.item_no} | ${e.event_category} | ${e.event_action} | ${e.event_label} | ${e.description} |`
    ).join('\n');
    return `${header}\n${rows}`;
  };

  const handleUnifiedCopy = () => {
    const textToCopy = activeTab === 'table' ? generateMarkdown() : jsonText;
    const type = activeTab === 'table' ? 'markdown' : 'json';
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        setCopyStatus(type);
        setTimeout(() => setCopyStatus(null), 2000);
    });
  };

  const generateCSV = () => {
    const headers = "No,EVENTCATEGORY,EVENTACTION,EVENTLABEL,Description\n";
    const rows = analysis.events.map(e => 
      `${e.item_no},"${e.event_category}","${e.event_action}","${e.event_label}","${e.description}"`
    ).join('\n');
    return headers + rows;
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert(language === 'ko' ? "파일 다운로드 중 오류가 발생했습니다." : "Error occurred while downloading file.");
    }
  };

  const exportFigmaSVG = () => {
    if (!activeImage) return;

    const img = new Image();
    img.src = activeImage.base64;
    img.onload = () => {
        try {
            const imgWidth = img.naturalWidth;
            const imgHeight = img.naturalHeight;
            
            // Layout Configuration
            const minTableWidth = 1000;
            const svgWidth = Math.max(imgWidth, minTableWidth);
            
            const rowHeight = 40;
            const headerHeight = 50;
            const tableY = imgHeight + 50; // 50px gap below image
            const tableHeight = headerHeight + (analysis.events.length * rowHeight);
            const totalHeight = tableY + tableHeight + 50; // 50px bottom padding
            
            const colWidths = {
                no: 50,
                cat: 150,
                act: 200,
                lbl: 200,
                desc: svgWidth - 600 // Fill remaining
            };
            
            const xPos = {
                no: 20,
                cat: 20 + colWidths.no + 10,
                act: 20 + colWidths.no + colWidths.cat + 20,
                lbl: 20 + colWidths.no + colWidths.cat + colWidths.act + 30,
                desc: 20 + colWidths.no + colWidths.cat + colWidths.act + colWidths.lbl + 40
            };

            const svg = `
              <svg width="${svgWidth}" height="${totalHeight}" viewBox="0 0 ${svgWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
                <style>
                  .text { font-family: sans-serif; fill: #1e293b; }
                  .header { font-weight: bold; fill: #64748b; font-size: 14px; text-transform: uppercase; }
                  .cell { font-size: 14px; }
                  .grid { stroke: #e2e8f0; stroke-width: 1; }
                </style>
                
                <g>
                  <image href="${activeImage.base64}" width="${imgWidth}" height="${imgHeight}" />
                  ${analysis.annotations.map(ann => {
                    const bx = ann.bbox.x * imgWidth;
                    const by = ann.bbox.y * imgHeight;
                    const bw = ann.bbox.w * imgWidth;
                    const bh = ann.bbox.h * imgHeight;

                    const isItemOne = ann.item_no === 1;
                    const tagRectY = isItemOne ? by : by - 28;
                    const tagTextY = isItemOne ? by + 20 : by - 8;

                    return `
                    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#ef4444" fill-opacity="0.1" stroke="#ef4444" stroke-width="3" />
                    <rect x="${bx}" y="${tagRectY}" width="32" height="28" fill="#ef4444" rx="4" />
                    <text x="${bx + 16}" y="${tagTextY}" fill="white" font-weight="bold" font-family="sans-serif" font-size="16" text-anchor="middle">${ann.item_no}</text>
                    `;
                  }).join('')}
                </g>

                <g transform="translate(0, ${tableY})">
                  <rect x="0" y="0" width="${svgWidth}" height="${tableHeight}" fill="white" stroke="#e2e8f0" rx="8" />
                  <rect x="0" y="0" width="${svgWidth}" height="${headerHeight}" fill="#f8fafc" rx="8" />
                  <text x="${xPos.no}" y="30" class="header">No</text>
                  <text x="${xPos.cat}" y="30" class="header">Category</text>
                  <text x="${xPos.act}" y="30" class="header">Action</text>
                  <text x="${xPos.lbl}" y="30" class="header">Label</text>
                  <text x="${xPos.desc}" y="30" class="header">Description</text>
                  <line x1="0" y1="${headerHeight}" x2="${svgWidth}" y2="${headerHeight}" class="grid" />

                  ${analysis.events.map((e, i) => {
                    const y = headerHeight + (i * rowHeight) + 25;
                    const lineY = headerHeight + ((i + 1) * rowHeight);
                    return `
                      <text x="${xPos.no}" y="${y}" class="text cell font-bold">${e.item_no}</text>
                      <text x="${xPos.cat}" y="${y}" class="text cell">${e.event_category}</text>
                      <text x="${xPos.act}" y="${y}" class="text cell" fill="#2563eb">${e.event_action}</text>
                      <text x="${xPos.lbl}" y="${y}" class="text cell" fill="#9333ea">${e.event_label}</text>
                      <text x="${xPos.desc}" y="${y}" class="text cell">${e.description}</text>
                      ${i < analysis.events.length - 1 ? `<line x1="0" y1="${lineY}" x2="${svgWidth}" y2="${lineY}" class="grid" />` : ''}
                    `;
                  }).join('')}
                </g>
              </svg>
            `.trim();

            // 1. Download local file
            downloadFile(svg, `figma_export_${activeScreenshotId}.svg`, 'image/svg+xml');

            // 2. Figma Round-trip Integration: Send message to parent (Figma Plugin)
            if (window.parent !== window) {
                window.parent.postMessage({
                    pluginMessage: {
                        type: 'UI2GA_WEB_TO_FIGMA_RESULT',
                        svg: svg,
                        screenshotId: activeScreenshotId
                    }
                }, '*');
            }
        } catch (e) {
            console.error(e);
            alert("SVG Export Generation Failed");
        }
    };
  };

  const handleCellDoubleClick = (itemNo: number, field: keyof TaggingEvent, currentValue: any) => {
    setEditingCell({ itemNo, field });
    setTempCellValue(String(currentValue));
  };

  const commitCellEdit = () => {
    if (editingCell) {
      onUpdateEvent(editingCell.itemNo, editingCell.field, tempCellValue);
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitCellEdit();
    }
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
    setJsonError(null);
  };

  const commitJsonEdit = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (parsed && Array.isArray(parsed.events)) {
        onUpdateEvents(parsed.events);
        setJsonError(null);
      } else {
        setJsonError("Invalid JSON structure: missing 'events' array");
      }
    } catch (e) {
      setJsonError("Invalid JSON syntax");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="h-12 border-b border-slate-200 flex items-center justify-between px-2 shrink-0">
         <div className="flex h-full">
             <button 
                onClick={() => setActiveTab('table')}
                className={`flex items-center gap-2 text-[11px] font-bold px-4 h-full border-b-2 transition-colors ${activeTab === 'table' ? 'border-[#4f46e5] text-[#4f46e5]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
             >
                <TableIcon className="w-3.5 h-3.5" />
                {t.table}
             </button>
             <button 
                onClick={() => setActiveTab('json')}
                className={`flex items-center gap-2 text-[11px] font-bold px-4 h-full border-b-2 transition-colors ${activeTab === 'json' ? 'border-[#4f46e5] text-[#4f46e5]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
             >
                <Code className="w-3.5 h-3.5" />
                {t.json}
             </button>
         </div>
         <div className="flex items-center gap-3 pr-2">
            <button 
                onClick={exportFigmaSVG}
                className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-1.5 rounded border border-purple-100 hover:bg-purple-100 flex items-center gap-1 transition-all active:scale-95"
            >
                <Figma className="w-3 h-3" />
                {t.exportFigma}
            </button>
            <div className="h-4 w-px bg-slate-200"></div>
            <div className="flex gap-2 text-[10px] text-slate-400 font-bold">
                <button onClick={() => downloadFile(generateCSV(), `${activeScreenshotId}_tagging.csv`, 'text/csv')} className="cursor-pointer hover:text-slate-600 uppercase">CSV</button>
                <button onClick={() => downloadFile(generateCSV(), `${activeScreenshotId}_tagging.xlsx`, 'application/vnd.ms-excel')} className="cursor-pointer hover:text-slate-600 uppercase">XLSX</button>
                <button onClick={() => downloadFile(jsonText, `${activeScreenshotId}_tagging.json`, 'application/json')} className="cursor-pointer hover:text-slate-600 uppercase">JSON</button>
            </div>
         </div>
      </div>

      <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-slate-400 italic font-bold">
            {activeTab === 'table' ? t.editMode : ''}
          </span>
          <div className="flex items-center gap-2">
              {activeTab === 'table' && (
                <button 
                    onClick={onAddRow}
                    className="text-[10px] font-bold bg-[#4f46e5] text-white px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" /> {t.addRow}
                </button>
              )}
              <button 
                onClick={handleUnifiedCopy}
                className={`p-2 bg-white border rounded transition-colors shadow-sm flex items-center justify-center ${copyStatus ? 'border-green-500 text-green-600 bg-green-50' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                title={activeTab === 'table' ? t.copyMarkdown : t.copyJSON}
              >
                  {copyStatus ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-hidden bg-white relative">
        {activeTab === 'table' ? (
          <div className="absolute inset-0 overflow-auto custom-scrollbar">
            <table className="min-w-full border-separate border-spacing-0">
                <thead className="bg-[#fcfdfe] sticky top-0 z-10">
                <tr>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100 w-10">No</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100 w-28">EVENTCATEGORY</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100 w-32">EVENTACTION</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100 w-32">EVENTLABEL</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">Description</th>
                    <th className="px-2 py-3 border-b border-slate-100 w-10"></th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {analysis.events.map((event) => (
                    <tr 
                        key={event.item_no} 
                        className={`hover:bg-slate-50 transition-colors group ${hoveredItemNo === event.item_no ? 'bg-indigo-50' : ''}`}
                    >
                    <td className="px-2 py-3 text-[11px] text-slate-400 text-center font-bold">
                        {event.item_no}
                    </td>
                    
                    {['event_category', 'event_action', 'event_label', 'description'].map((f) => {
                        const field = f as keyof TaggingEvent;
                        const isEditing = editingCell?.itemNo === event.item_no && editingCell?.field === field;
                        
                        return (
                            <td 
                                key={field}
                                onDoubleClick={() => handleCellDoubleClick(event.item_no, field, event[field])}
                                className={`px-3 py-3 text-[11px] border-l border-slate-50 cursor-text ${field === 'event_action' ? 'text-[#2563eb] font-bold' : field === 'event_label' ? 'text-[#9333ea] font-bold' : 'text-slate-800'}`}
                            >
                                {isEditing ? (
                                    <input 
                                        autoFocus
                                        className="w-full bg-indigo-50 border border-indigo-200 outline-none px-1 rounded shadow-sm text-slate-900"
                                        value={tempCellValue}
                                        onChange={(e) => setTempCellValue(e.target.value)}
                                        onBlur={commitCellEdit}
                                        onKeyDown={handleKeyDown}
                                    />
                                ) : (
                                    event[field]
                                )}
                            </td>
                        );
                    })}

                    <td className="px-2 py-3 text-center">
                        <button onClick={() => onDeleteRow(event.item_no)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col">
             <div className="flex-1 relative">
                <textarea
                    className={`w-full h-full p-4 text-[11px] font-mono leading-relaxed outline-none resize-none ${jsonError ? 'bg-red-50' : 'bg-slate-50 text-slate-700'}`}
                    value={jsonText}
                    onChange={handleJsonChange}
                    onBlur={commitJsonEdit}
                    spellCheck={false}
                />
             </div>
             {jsonError && (
                 <div className="h-8 bg-red-100 border-t border-red-200 flex items-center px-4 gap-2 text-[10px] text-red-600 font-bold shrink-0">
                     <AlertCircle className="w-3 h-3" />
                     {jsonError}
                 </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisResult;