import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Plus, ArrowUp, X, FileText, Loader2, Archive, Sparkles } from "lucide-react";

/* --- UTILS --- */
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/* --- COMPONENTS --- */

interface AttachedFile {
  id: string;
  file: File;
  type: string;
  preview: string | null;
  uploadStatus: string;
  content?: string;
}

interface FilePreviewCardProps {
  file: AttachedFile;
  onRemove: (id: string) => void;
}

const FilePreviewCard: React.FC<FilePreviewCardProps> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith("image/") && file.preview;

  return (
    <div className="relative group flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-bg-300 bg-bg-200 animate-fade-in transition-all hover:border-text-400">
      {isImage ? (
        <div className="w-full h-full relative">
          <Image src={file.preview!} alt={file.file.name} fill unoptimized className="object-cover" />
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
        </div>
      ) : (
        <div className="w-full h-full p-3 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-bg-300 rounded">
              <FileText className="w-4 h-4 text-text-300" />
            </div>
            <span className="text-[10px] font-medium text-text-400 uppercase tracking-wider truncate">
              {file.file.name.split('.').pop()}
            </span>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-text-200 truncate" title={file.file.name}>
              {file.file.name}
            </p>
            <p className="text-[10px] text-text-500">
              {formatFileSize(file.file.size)}
            </p>
          </div>
        </div>
      )}

      {/* Remove Button Overlay */}
      <button
        onClick={() => onRemove(file.id)}
        className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Upload Status */}
      {file.uploadStatus === 'uploading' && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        </div>
      )}
    </div>
  );
};

// Pasted Content Card
interface PastedContentCardProps {
  content: {
    id: string;
    content: string;
    timestamp: Date;
  };
  onRemove: (id: string) => void;
}

type PastedContent = PastedContentCardProps["content"];

const PastedContentCard: React.FC<PastedContentCardProps> = ({ content, onRemove }) => {
  return (
    <div className="relative group flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden border border-[#E5E5E5] dark:border-[#30302E] bg-white dark:bg-[#20201F] animate-fade-in p-3 flex flex-col justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="overflow-hidden w-full">
        <p className="text-[10px] text-[#9CA3AF] leading-[1.4] font-mono break-words whitespace-pre-wrap line-clamp-4 select-none">
          {content.content}
        </p>
      </div>

      <div className="flex items-center justify-between w-full mt-2">
        <div className="inline-flex items-center justify-center px-1.5 py-[2px] rounded border border-[#E5E5E5] dark:border-[#404040] bg-white dark:bg-transparent">
          <span className="text-[9px] font-bold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-wider font-sans">PASTED</span>
        </div>
      </div>

      <button
        onClick={() => onRemove(content.id)}
        className="absolute top-2 right-2 p-[3px] bg-white dark:bg-card border border-[#E5E5E5] dark:border-zinc-800 rounded-full text-[#9CA3AF] hover:text-[#6B7280] dark:hover:text-white transition-colors shadow-sm opacity-0 group-hover:opacity-100"
      >
        <X className="w-2 h-2" />
      </button>
    </div>
  );
};

// 4. Main Chat Input Component
interface ClaudeChatInputProps {
  onSendMessage: (data: {
    message: string;
    files: AttachedFile[];
    pastedContent: PastedContent[];
    isThinkingEnabled: boolean;
  }) => void;
  isLoading?: boolean;
}

const ClaudeChatInput: React.FC<ClaudeChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [pastedContent, setPastedContent] = useState<PastedContent[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 384) + "px"; // 96 * 4 = 384px (max-h-96)
    }
  }, [message]);

  // File Handling
  const handleFiles = useCallback((newFilesList: FileList | File[]) => {
    const newFiles = Array.from(newFilesList).map(file => {
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        type: isImage ? 'image/unknown' : (file.type || 'application/octet-stream'),
        preview: isImage ? URL.createObjectURL(file) : null,
        uploadStatus: 'pending'
      };
    });

    setFiles(prev => [...prev, ...newFiles]);

    // Dynamic Feedback Message
    setMessage(prev => {
      if (prev) return prev;
      if (newFiles.length === 1) {
        const f = newFiles[0];
        if (f.type.startsWith('image/')) return "Analisar imagem...";
        return "Analisar documento...";
      }
      return `Analisar ${newFiles.length} arquivos...`;
    });

    newFiles.forEach(f => {
      setTimeout(() => {
        setFiles(prev => prev.map(p => p.id === f.id ? { ...p, uploadStatus: 'complete' } : p));
      }, 800 + Math.random() * 1000);
    });
  }, []);

  // Drag & Drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  // Paste Handling
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      handleFiles(pastedFiles);
      return;
    }

    // Handle large text paste
    const text = e.clipboardData.getData('text');
    if (text.length > 300) {
      e.preventDefault();
      const snippet = {
        id: Math.random().toString(36).substr(2, 9),
        content: text,
        timestamp: new Date()
      };
      setPastedContent(prev => [...prev, snippet]);

      if (!message) {
        setMessage("Analisar texto copiado...");
      }
    }
  };

  const handleSend = () => {
    if (!message.trim() && files.length === 0 && pastedContent.length === 0) return;
    onSendMessage({ message, files, pastedContent, isThinkingEnabled });
    setMessage("");
    setFiles([]);
    setPastedContent([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = message.trim() || files.length > 0 || pastedContent.length > 0;

  return (
    <div
      className="relative w-full max-w-2xl mx-auto transition-all duration-300 font-sans"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Main Container */}
      <div className="!box-content flex flex-col mx-2 md:mx-0 items-stretch transition-all duration-200 relative z-10 rounded-2xl cursor-text border border-bg-300 dark:border-transparent shadow-[0_0_15px_rgba(0,0,0,0.08)] focus-within:shadow-[0_0_25px_rgba(0,0,0,0.15)] bg-white dark:bg-card font-sans antialiased">
        <div className="flex flex-col px-3 pt-3 pb-2 gap-2">
          
          {/* Artifacts (Files & Pastes) */}
          {(files.length > 0 || pastedContent.length > 0) && (
            <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 px-1">
              {pastedContent.map(content => (
                <PastedContentCard
                  key={content.id}
                  content={content}
                  onRemove={id => setPastedContent(prev => prev.filter(c => c.id !== id))}
                />
              ))}
              {files.map(file => (
                <FilePreviewCard
                  key={file.id}
                  file={file}
                  onRemove={id => setFiles(prev => prev.filter(f => f.id !== id))}
                />
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="relative mb-1">
            <div className="max-h-96 w-full overflow-y-auto custom-scrollbar font-sans break-words transition-opacity duration-200 min-h-[2.5rem] pl-1">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte à Prisma IA..."
                className="w-full bg-transparent border-0 outline-none text-text-100 text-[16px] placeholder:text-text-400 resize-none overflow-hidden py-0 leading-relaxed block font-normal antialiased"
                rows={1}
                autoFocus
                style={{ minHeight: '1.5em' }}
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex gap-2 w-full items-center">
            {/* Left Tools */}
            <div className="relative flex-1 flex items-center shrink min-w-0 gap-1">
              {/* Attach Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center relative shrink-0 transition-colors duration-200 h-8 w-8 rounded-lg active:scale-95 text-text-400 hover:text-text-200 hover:bg-bg-200"
                type="button"
                aria-label="Anexar arquivo"
              >
                <Plus className="w-5 h-5" />
              </button>

              {/* Extended Thinking Button */}
              <div className="flex shrink min-w-8 !shrink-0">
                <button
                  onClick={() => setIsThinkingEnabled(!isThinkingEnabled)}
                  className={`transition-all duration-200 h-8 w-8 flex items-center justify-center rounded-lg active:scale-95 ${
                    isThinkingEnabled ? 'text-accent bg-accent/10' : 'text-text-400 hover:text-text-200 hover:bg-bg-200'
                  }`}
                  aria-pressed={isThinkingEnabled}
                  aria-label="Extended thinking"
                >
                  <Sparkles className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Right Tools */}
            <div className="flex flex-row items-center min-w-0 gap-1">
              {/* Send Button */}
              <div>
                <button
                  onClick={handleSend}
                  disabled={!hasContent || isLoading}
                  className={`inline-flex items-center justify-center relative shrink-0 transition-colors h-8 w-8 rounded-xl active:scale-95 ${
                    hasContent && !isLoading
                      ? 'bg-accent text-white hover:bg-accent-hover shadow-md'
                      : 'bg-accent/30 text-white/60 cursor-default'
                  }`}
                  type="button"
                  aria-label="Enviar mensagem"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-bg-200/90 border-2 border-dashed border-accent rounded-2xl z-50 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none">
          <Archive className="w-10 h-10 text-accent mb-2 animate-bounce" />
          <p className="text-accent font-medium">Solte arquivos aqui para enviar</p>
        </div>
      )}

      {/* Hidden Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};

export default ClaudeChatInput;
