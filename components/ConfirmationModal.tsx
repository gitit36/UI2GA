import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText: string;
  cancelText: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-[400px] max-w-full m-4 transform transition-all scale-100 opacity-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-slate-800 font-bold text-lg mb-4">
              {confirmText === 'Yes' ? 'Are you sure?' : '확인 필요'}
            </p>
            <p className="text-slate-600 text-sm mb-8 leading-relaxed">
              {message}
            </p>
            <div className="flex gap-3 w-full">
               <button
                 onClick={onCancel}
                 className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
               >
                 {cancelText}
               </button>
               <button
                 onClick={onConfirm}
                 className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
               >
                 {confirmText}
               </button>
            </div>
        </div>
      </div>
    </div>
  );
};
