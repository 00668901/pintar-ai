import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message, QuizQuestion } from '../types';
import { SparklesIcon, CopyIcon, CheckIcon, DownloadIcon, FileIcon } from './Icons';

interface ChatBubbleProps {
  message: Message;
  highlightText?: string;
  onCreateQuiz?: (text: string) => void;
  isCreatingQuiz?: boolean;
}

const QuizView: React.FC<{ quiz: QuizQuestion[] }> = ({ quiz }) => {
    const [answers, setAnswers] = useState<{[key: number]: string}>({});
    const [showResults, setShowResults] = useState(false);

    const score = useMemo(() => {
        let correct = 0;
        quiz.forEach((q, i) => {
            if (answers[i] === q.answer) correct++;
        });
        return Math.round((correct / quiz.length) * 100);
    }, [answers, quiz]);

    return (
        <div className="mt-4 bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span className="text-xl">🧠</span> Kuis Kilat
            </h3>
            
            <div className="space-y-6">
                {quiz.map((q, idx) => {
                    const userAnswer = answers[idx];
                    const isCorrect = userAnswer === q.answer;
                    
                    return (
                        <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                            <p className="font-medium text-slate-800 dark:text-slate-200 mb-3 text-sm">{idx + 1}. {q.question}</p>
                            <div className="space-y-2">
                                {q.options.map((opt, optIdx) => {
                                    let btnClass = "w-full text-left px-3 py-2 text-sm rounded-lg border transition-all ";
                                    if (showResults) {
                                         if (opt === q.answer) btnClass += "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 font-medium";
                                         else if (userAnswer === opt && opt !== q.answer) btnClass += "bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300";
                                         else btnClass += "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500";
                                    } else {
                                         if (userAnswer === opt) btnClass += "bg-primary-50 dark:bg-primary-900/30 border-primary-400 dark:border-primary-600 text-primary-700 dark:text-primary-300";
                                         else btnClass += "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300";
                                    }

                                    return (
                                        <button
                                            key={optIdx}
                                            onClick={() => !showResults && setAnswers(p => ({...p, [idx]: opt}))}
                                            className={btnClass}
                                        >
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>
                            {showResults && (
                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2 rounded">
                                    <strong>Pembahasan:</strong> {q.explanation}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-6 flex items-center justify-between">
                {showResults ? (
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Skor: {score} / 100 {score === 100 ? '🎉' : ''}
                    </div>
                ) : (
                    <div className="text-xs text-slate-400 dark:text-slate-500">Jawab semua soal untuk melihat hasil</div>
                )}
                <button
                    onClick={() => setShowResults(!showResults)}
                    disabled={Object.keys(answers).length < quiz.length}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
                >
                    {showResults ? "Tutup Hasil" : "Cek Jawaban"}
                </button>
            </div>
        </div>
    );
};

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, highlightText, onCreateQuiz, isCreatingQuiz }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (dataUrl: string, index: number) => {
      const link = document.createElement('a');
      link.href = dataUrl;
      const mime = dataUrl.match(/:(.*?);/)?.[1] || 'image/png';
      
      let ext = 'bin';
      if (mime.includes('image')) ext = mime.split('/')[1];
      else if (mime.includes('pdf')) ext = 'pdf';
      else if (mime.includes('word') || mime.includes('msword')) ext = 'docx';
      else if (mime.includes('presentation') || mime.includes('powerpoint')) ext = 'pptx';

      link.download = `pintarai-file-${Date.now()}-${index}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Plain text highlighting (mainly for User)
  const renderHighlightedText = (text: string, highlight: string) => {
    if (!highlight || !highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === highlight.toLowerCase() 
        ? <mark key={i} className="search-highlight">{part}</mark> 
        : part
    );
  };

  // Custom renderer for ReactMarkdown to highlight text in P and LI tags
  const HighlightRenderer = ({ children }: { children?: React.ReactNode }) => {
      if (typeof children === 'string' && highlightText) {
          return <>{renderHighlightedText(children, highlightText)}</>;
      }
      return <>{children}</>;
  };

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${isUser ? 'bg-primary-600 text-white' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none'}`}>
           {isUser ? (
             <span className="font-bold text-sm">U</span>
           ) : (
             <SparklesIcon />
           )}
        </div>

        {/* Content Bubble */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full overflow-hidden`}>
          <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed overflow-hidden ${
            isUser 
              ? 'bg-primary-600 text-white rounded-tr-none' 
              : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none'
          }`}>
             {/* Display Images/Files if any */}
             {message.images && message.images.length > 0 && (
               <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-thin">
                 {message.images.map((img, idx) => {
                   const mime = img.match(/:(.*?);/)?.[1] || '';
                   const isImage = mime.startsWith('image/');
                   
                   let iconColor = 'text-slate-500';
                   let label = 'FILE';
                   
                   if (mime.includes('pdf')) {
                       iconColor = 'text-red-500';
                       label = 'PDF';
                   } else if (mime.includes('word') || mime.includes('msword')) {
                       iconColor = 'text-blue-600';
                       label = 'DOCX';
                   } else if (mime.includes('presentation') || mime.includes('powerpoint')) {
                       iconColor = 'text-orange-500';
                       label = 'PPTX';
                   }

                   return (
                     <div key={idx} className="relative group shrink-0">
                         {!isImage ? (
                           <div className={`h-40 w-32 rounded-lg border border-white/20 bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center ${iconColor}`}>
                             <FileIcon />
                             <span className="text-xs font-bold mt-2">{label}</span>
                           </div>
                         ) : (
                           <img src={img} alt={`Attachment ${idx + 1}`} className="h-40 w-auto rounded-lg border border-white/20 object-cover" />
                         )}
                         <button 
                           onClick={() => handleDownload(img, idx)}
                           className="absolute bottom-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                           title="Unduh File"
                         >
                             <DownloadIcon />
                         </button>
                     </div>
                   );
                 })}
               </div>
             )}
             
             {/* Text Content */}
             {isUser ? (
               <div className="whitespace-pre-wrap">
                 {highlightText ? renderHighlightedText(message.text, highlightText) : message.text}
               </div>
             ) : (
               <div className="markdown-body">
                 <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]} 
                    rehypePlugins={[rehypeKatex]}
                    components={{
                        // Simple highlighting attempt for paragraphs and list items
                        p: (props: any) => <p className="mb-3"><HighlightRenderer>{props.children}</HighlightRenderer></p>,
                        li: (props: any) => <li><HighlightRenderer>{props.children}</HighlightRenderer></li>
                    }}
                 >
                    {message.text}
                 </ReactMarkdown>
               </div>
             )}

             {/* Quiz View */}
             {message.quiz && <QuizView quiz={message.quiz} />}
          </div>
          
          {/* Metadata Row & Actions */}
          <div className="flex items-center justify-between w-full mt-1 px-1">
             <div className="flex items-center gap-2">
                 <span className="text-xs text-slate-400 dark:text-slate-500">
                   {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 </span>
                 {message.usage && !isUser && (
                   <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700" title="Token Usage">
                     ✨ {message.usage.totalTokens} tokens
                   </span>
                 )}
             </div>
             
             {!isUser && (
                <div className="flex items-center gap-3">
                    {/* Create Quiz Button for AI messages without quiz */}
                    {onCreateQuiz && !message.quiz && message.text.length > 100 && (
                        <button
                            onClick={() => onCreateQuiz(message.text)}
                            disabled={isCreatingQuiz}
                            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                            {isCreatingQuiz ? (
                                <span className="animate-pulse">Membuat...</span>
                            ) : (
                                <><span>📝</span> Buat Kuis</>
                            )}
                        </button>
                    )}

                    <button 
                      onClick={handleCopy} 
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary-600 dark:text-slate-500 dark:hover:text-primary-400 transition-colors"
                      title="Salin teks"
                    >
                      {copied ? <CheckIcon /> : <CopyIcon />}
                      {copied ? "Disalin" : "Salin"}
                    </button>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};