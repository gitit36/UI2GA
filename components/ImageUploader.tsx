
import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { getTexts } from '../utils/localization';
import { Language } from '../types';

interface ImageUploaderProps {
  onImagesSelected: (files: File[]) => void;
  isLoading: boolean;
  language: Language;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesSelected, isLoading, language }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = getTexts(language);

  const handleFiles = (files: FileList) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (validFiles.length > 0) onImagesSelected(validFiles);
  };

  return (
    <div
      className={`relative w-full py-16 px-10 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer shadow-sm
        ${isDragging ? 'border-[#4f46e5] bg-indigo-50/50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'}
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}
      `}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        multiple
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      
      <div className="bg-slate-50 p-6 rounded-full mb-6 text-[#4f46e5] group-hover:scale-110 transition-transform">
        <Upload className="w-10 h-10" />
      </div>
      
      <div className="text-center">
        <p className="font-bold text-xl text-slate-900 mb-1">{t.clickDrag}</p>
        <p className="text-sm text-slate-400 font-medium">{t.supports}</p>
      </div>
    </div>
  );
};

export default ImageUploader;
