import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// @ts-ignore
import mammoth from 'mammoth';
// @ts-ignore
import JSZip from 'jszip';
import { Note, QuizQuestion } from '../types';
import { CloseIcon, CheckIcon, FileIcon, ReloadIcon, SparklesIcon, BookIcon, TrashIcon, PlusIcon, SortIcon, CopyIcon } from '../components/Icons';
import { regenerateQuiz } from '../services/geminiService';

interface NoteDetailPageProps {
    note: Note;
    onBack: () => void;
    onUpdateNote: (updatedNote: Note) => void;
    onDeleteNote: (id: string, title: string) => void;
}

// --- Custom Markdown Components ---

const CustomPre = ({ children }: any) => {
    // Try to detect language from child code element class
    let lang = 'Code';
    let isOutput = false;
    let content = '';

    if (children && children.props) {
        content = children.props.children || '';
        const className = children.props.className || '';
        const match = /language-(\w+)/.exec(className);
        if (match) {
            lang = match[1].toUpperCase();
            if (lang === 'TEXT' || lang === 'PLAINTEXT') {
                // Heuristic: if it's explicitly text/plaintext, treat as output/terminal
                isOutput = true; 
                lang = 'OUTPUT';
            }
        }
    }

    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (isOutput) {
        return (
            <div className="my-6 rounded-xl overflow-hidden bg-[#1e1e1e] border border-slate-700 shadow-lg">
                <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-slate-600">
                    <span className="text-xs font-mono font-bold text-green-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        TERMINAL OUTPUT
                    </span>
                </div>
                <div className="p-4 overflow-x-auto">
                    <pre className="font-mono text-sm leading-relaxed text-slate-300">
                        {children}
                    </pre>
                </div>
            </div>
        );
    }

    return (
        <div className="my-8 rounded-xl overflow-hidden bg-[#0d1117] border border-slate-800 shadow-xl group">
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-slate-800/50">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                    </div>
                    <span className="ml-3 text-xs font-mono font-bold text-slate-400 uppercase">{lang}</span>
                </div>
                <button 
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-800 transition-colors text-xs text-slate-400 hover:text-white"
                >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <div className="p-5 overflow-x-auto">
                <pre className="font-mono text-sm leading-loose text-slate-200">
                    {children}
                </pre>
            </div>
        </div>
    );
};

// --- FILE HELPERS (Duplicated from ChatApp for portability) ---
const isDocxFile = (file: File) => {
    const name = file.name.toLowerCase();
    const type = file.type;
    if (type === 'application/msword' || name.endsWith('.doc')) return false;
    return type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx');
};

const isPptxFile = (file: File) => file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || file.name.toLowerCase().endsWith('.pptx');

const extractTextFromBinary = async (file: File): Promise<string> => {
    try {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
        const text = decoder.decode(buffer);
        const matches = text.match(/[A-Za-z0-9\s.,?!@#$%^&*()_\-+=[\]{}|\\:;"'<>/]{4,}/g);
        if (matches && matches.length > 0) {
            return matches.join(' ');
        }
        return "";
    } catch (e) {
        console.error("Binary extraction failed", e);
        return "";
    }
};

const extractTextFromPptx = async (file: File): Promise<string> => {
    try {
        const zip = new JSZip();
        await zip.loadAsync(file);
        
        const slideFiles = Object.keys(zip.files).filter(name => name.includes('ppt/slides/slide'));
        slideFiles.sort((a: string, b: string) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
            const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
            return numA - numB;
        });

        let fullText = "";
        for (const slideFile of slideFiles) {
            const content = await zip.files[slideFile].async('string');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, "text/xml");
            
            const allElements = xmlDoc.getElementsByTagName("*");
            let slideText = "";
            for(let i=0; i<allElements.length; i++) {
                if(allElements[i].localName === 't') {
                    slideText += allElements[i].textContent + " ";
                }
            }
            
            if (slideText.trim()) {
                fullText += `[Slide ${slideFile.match(/slide(\d+)/)?.[1]}]\n${slideText.trim()}\n\n`;
            }
        }
        return fullText;
    } catch (e) {
        console.error("PPTX Parsing Error", e);
        return await extractTextFromBinary(file); // Fallback
    }
};

export const NoteDetailPage: React.FC<NoteDetailPageProps> = ({ note, onBack, onUpdateNote, onDeleteNote }) => {
    const [activeTab, setActiveTab] = useState<'summary' | 'quiz'>('summary');
    const [quizAnswers, setQuizAnswers] = useState<{[key: number]: string}>({});
    const [essayRevealed, setEssayRevealed] = useState<{[key: number]: boolean}>({});
    const [showResults, setShowResults] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isProcessingFiles, setIsProcessingFiles] = useState(false);
    const [fileSort, setFileSort] = useState<'name-asc' | 'name-desc' | 'date-new' | 'date-old'>('date-old');
    
    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editedTitle, setEditedTitle] = useState(note.title);
    const [editedContent, setEditedContent] = useState(note.content);
    const [editedFiles, setEditedFiles] = useState<string[]>(note.originalFiles || []);
    const [editedSourceNames, setEditedSourceNames] = useState<string[]>(note.sourceFileNames || []); 
    
    const editFileInputRef = useRef<HTMLInputElement>(null);

    // Helper: Fix raw content formatting (unescape newlines from JSON)
    const formattedContent = useMemo(() => {
        if (!note.content) return "";
        let clean = note.content;
        clean = clean.replace(/\\n/g, '\n');
        clean = clean.replace(/\\t/g, '  ');
        return clean;
    }, [note.content]);

    // Reset edit state when note changes or when canceling edit
    useEffect(() => {
        setEditedTitle(note.title);
        setEditedContent(formattedContent);
        setEditedFiles(note.originalFiles || []);
        setEditedSourceNames(note.sourceFileNames || []);
    }, [note, isEditing, formattedContent]);

    const handleAnswer = (qIndex: number, option: string) => {
        if (showResults) return;
        setQuizAnswers(prev => ({ ...prev, [qIndex]: option }));
    };

    const handleResetQuestion = (index: number) => {
        setQuizAnswers(prev => {
            const next = { ...prev };
            delete next[index];
            return next;
        });
    };

    const toggleEssayAnswer = (index: number) => {
        setEssayRevealed(prev => ({...prev, [index]: !prev[index]}));
    };

    const calculateScore = () => {
        if (!note.quiz) return 0;
        let correct = 0;
        let totalMCQ = 0;
        
        note.quiz.forEach((q, idx) => {
            if (q.type === 'mcq' || (!q.type && q.options)) { // Backward compatibility
                totalMCQ++;
                if (quizAnswers[idx] === q.answer) correct++;
            }
        });
        
        if (totalMCQ === 0) return 0;
        return Math.round((correct / totalMCQ) * 100);
    };

    const countMCQ = useMemo(() => {
        return note.quiz?.filter(q => q.type === 'mcq' || (!q.type && q.options))?.length || 0;
    }, [note.quiz]);

    const handleRegenerateQuiz = async () => {
        if (isRegenerating) return;
        setIsRegenerating(true);
        try {
            const newQuiz = await regenerateQuiz(note.content);
            if (newQuiz && newQuiz.length > 0) {
                const updatedNote = { ...note, quiz: newQuiz };
                onUpdateNote(updatedNote);
                setQuizAnswers({});
                setEssayRevealed({});
                setShowResults(false);
            } else {
                alert("Gagal membuat soal baru. Silakan coba lagi.");
            }
        } catch (error) {
            console.error(error);
            alert("Terjadi kesalahan saat menghubungi AI.");
        } finally {
            setIsRegenerating(false);
        }
    };

    // Edit Logic with Smart Extraction
    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        if (files.length === 0) return;
        
        setIsProcessingFiles(true);
        let additionalContent = "";

        const newFilesData: string[] = [];
        const newFileNames: string[] = [];

        for (const file of files) {
            try {
                // 1. Convert to Base64 for Visual Attachment
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (reader.result) resolve(reader.result as string);
                        else reject(new Error("Empty result"));
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                newFilesData.push(base64);
                newFileNames.push(file.name);

                // 2. Extract Text (Smart Processing)
                let text = "";
                if (isDocxFile(file)) {
                     try {
                        const arrayBuffer = await file.arrayBuffer();
                        const result = await mammoth.extractRawText({ arrayBuffer });
                        text = result.value;
                     } catch (err) {
                        console.warn("Mammoth failed, fallback to binary", err);
                        text = await extractTextFromBinary(file);
                     }
                } else if (isPptxFile(file)) {
                    text = await extractTextFromPptx(file);
                } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
                    text = await file.text();
                } else {
                     // Fallback for unknown text types or misidentified types including msword
                     text = await extractTextFromBinary(file);
                }

                if (text) {
                    additionalContent += `\n\n--- Tambahan: ${file.name} ---\n${text}\n`;
                }

            } catch (err) {
                console.error("Error reading file:", file.name, err);
                alert(`Gagal memproses file ${file.name}`);
            }
        }

        setEditedFiles(prev => [...prev, ...newFilesData]);
        setEditedSourceNames(prev => [...prev, ...newFileNames]);
        if (additionalContent) {
            setEditedContent(prev => prev + additionalContent);
        }
        
        setIsProcessingFiles(false);
        if (editFileInputRef.current) editFileInputRef.current.value = '';
    };

    const handleRemoveFile = (index: number) => {
        setEditedFiles(prev => prev.filter((_, i) => i !== index));
        setEditedSourceNames(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        const updatedNote: Note = {
            ...note,
            title: editedTitle,
            content: editedContent, // Save the edited (cleaned + added) content back
            originalFiles: editedFiles,
            sourceFileNames: editedSourceNames, 
        };
        onUpdateNote(updatedNote);
        setIsEditing(false);
    };

    // Memoized sorted files for display
    const sortedFiles = useMemo(() => {
        const files = isEditing ? editedFiles : note.originalFiles;
        const names = isEditing ? editedSourceNames : note.sourceFileNames;
        
        // Combine data for sorting
        const combined = files.map((f, i) => ({
            data: f,
            name: names?.[i] || `File ${i+1}`,
            originalIndex: i
        }));

        switch (fileSort) {
            case 'name-asc':
                return combined.sort((a, b) => a.name.localeCompare(b.name));
            case 'name-desc':
                return combined.sort((a, b) => b.name.localeCompare(a.name));
            case 'date-new': // Reverses the array (assuming higher index = newer)
                return combined.reverse();
            case 'date-old':
            default:
                return combined;
        }
    }, [isEditing, editedFiles, editedSourceNames, note.originalFiles, note.sourceFileNames, fileSort]);

    // Markdown render components for Questions
    const questionRenderComponents = {
        code: ({node, inline, className, children, ...props}: any) => {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline) {
               return <code className={className} {...props}>{children}</code>;
            }
            return (
               <code className="bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-2 py-1 rounded-md text-sm font-mono border border-slate-200 dark:border-slate-700 mx-1" {...props}>
                   {children}
               </code>
            );
        },
        pre: CustomPre
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0B1120] animate-fade-in relative transition-colors duration-300">
             
             {/* Note Header */}
             <div className="border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0B1120]/90 backdrop-blur-md sticky top-0 z-30">
                 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
                     <div className="flex items-center gap-4 mb-4">
                        <button onClick={onBack} className="p-2 -ml-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors" title="Kembali">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                            </svg>
                        </button>
                        
                        <div className="flex-1 min-w-0">
                            {isEditing ? (
                                <input 
                                    type="text" 
                                    value={editedTitle}
                                    onChange={(e) => setEditedTitle(e.target.value)}
                                    className="w-full text-xl font-bold text-slate-800 dark:text-slate-100 border-b border-primary-500 bg-transparent focus:outline-none py-1"
                                    placeholder="Judul Catatan"
                                />
                            ) : (
                                <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white truncate tracking-tight">{note.title}</h2>
                            )}
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                                <span>📅 {new Date(note.createdAt).toLocaleDateString()}</span>
                                <span>•</span>
                                <span>{note.sourceFileNames?.length || 0} Sumber</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                             {isEditing ? (
                                 <>
                                    <button 
                                        onClick={() => setIsEditing(false)} 
                                        className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                        Batal
                                    </button>
                                    <button 
                                        onClick={handleSave} 
                                        disabled={isProcessingFiles}
                                        className="px-4 py-1.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-all shadow-md shadow-primary-200 dark:shadow-none disabled:opacity-70"
                                    >
                                        {isProcessingFiles ? 'Memproses...' : 'Simpan'}
                                    </button>
                                 </>
                             ) : (
                                 <>
                                    <button 
                                        onClick={() => setIsEditing(true)}
                                        className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                        title="Edit Catatan"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                    </button>
                                    <button 
                                        onClick={() => onDeleteNote(note.id, note.title)}
                                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                        title="Hapus Catatan"
                                    >
                                        <TrashIcon />
                                    </button>
                                 </>
                             )}
                        </div>
                     </div>

                     {/* Custom Tabs */}
                     <div className="flex gap-1">
                        <button 
                            onClick={() => setActiveTab('summary')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all border ${activeTab === 'summary' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                            Ringkasan
                        </button>
                        <button 
                            onClick={() => setActiveTab('quiz')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all border ${activeTab === 'quiz' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                            Kuis Latihan <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300">{note.quiz?.length || 0}</span>
                        </button>
                     </div>
                 </div>
             </div>

             {/* Content Area */}
             <div className="flex-1 overflow-y-auto">
                 <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8">
                     
                     {/* TAB: SUMMARY */}
                     {(activeTab === 'summary' || isEditing) && (
                         <div className="animate-fade-in">
                             
                             {/* Section: Sumber Materi */}
                             {(editedFiles.length > 0 || isEditing || (note.sourceFileNames && note.sourceFileNames.length > 0)) && (
                                 <div className="mb-10">
                                     <div className="flex items-center justify-between mb-4">
                                         <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                             <FileIcon /> Sumber Materi
                                         </h4>
                                         
                                         <div className="flex items-center gap-3">
                                             {/* Sort Controls */}
                                             <div className="relative group">
                                                 <select 
                                                     value={fileSort}
                                                     onChange={(e) => setFileSort(e.target.value as any)}
                                                     className="appearance-none bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 pl-8 pr-8 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                                                 >
                                                     <option value="date-old">Urut: Terlama</option>
                                                     <option value="date-new">Urut: Terbaru</option>
                                                     <option value="name-asc">Nama (A-Z)</option>
                                                     <option value="name-desc">Nama (Z-A)</option>
                                                 </select>
                                                 <div className="absolute left-2.5 top-1.5 text-slate-400 pointer-events-none scale-75">
                                                     <SortIcon />
                                                 </div>
                                             </div>

                                             {isEditing && (
                                                 <button 
                                                    onClick={() => editFileInputRef.current?.click()}
                                                    disabled={isProcessingFiles}
                                                    className="flex items-center gap-1 text-primary-600 text-xs font-bold hover:underline disabled:opacity-50"
                                                 >
                                                    {isProcessingFiles ? (
                                                        <span className="animate-pulse">Sedang Ekstrak Teks...</span>
                                                    ) : (
                                                        <>+ Tambah File</>
                                                    )}
                                                 </button>
                                             )}
                                         </div>
                                     </div>
                                     
                                     {/* Grid Layout for Source Files */}
                                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                         {sortedFiles.map((fileItem, i) => {
                                             const file = fileItem.data;
                                             const fileName = fileItem.name;
                                             const mime = file.match(/:(.*?);/)?.[1] || '';
                                             
                                             const isPdf = mime.includes('pdf') || fileName.endsWith('.pdf');
                                             const isDoc = mime.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx');
                                             const isPpt = mime.includes('presentation') || mime.includes('powerpoint') || mime.includes('vnd.ms-powerpoint') || fileName.endsWith('.ppt') || fileName.endsWith('.pptx');
                                             const isTxt = mime === 'text/plain' || fileName.endsWith('.txt');
                                             
                                             let bgClass = "bg-slate-100 dark:bg-slate-800/50";
                                             let textClass = "text-slate-500 dark:text-slate-400";
                                             let label = "FILE";

                                             if (isPdf) {
                                                bgClass = "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30";
                                                textClass = "text-red-500 dark:text-red-400";
                                                label = "PDF";
                                             } else if (isDoc) {
                                                bgClass = "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30";
                                                textClass = "text-blue-500 dark:text-blue-400";
                                                label = "DOC";
                                             } else if (isPpt) {
                                                bgClass = "bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30";
                                                textClass = "text-orange-500 dark:text-orange-400";
                                                label = "PPT";
                                             } else if (isTxt) {
                                                bgClass = "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700";
                                                textClass = "text-slate-600 dark:text-slate-300";
                                                label = "TXT";
                                             }

                                             return (
                                                 <div key={i} className={`group relative aspect-[4/3] rounded-xl border ${bgClass} ${isEditing ? 'border-slate-300 dark:border-slate-600 cursor-default' : 'border-transparent'} flex flex-col items-center justify-center p-4 transition-all hover:scale-[1.02] hover:shadow-md`}>
                                                     {mime.startsWith('image/') ? (
                                                         <img src={file} className="absolute inset-0 w-full h-full object-cover rounded-xl opacity-80 group-hover:opacity-100 transition-opacity" />
                                                     ) : (
                                                         <>
                                                            <div className={`${textClass} mb-2 scale-125`}><FileIcon /></div>
                                                            <span className={`text-[10px] font-bold ${textClass}`}>{label}</span>
                                                         </>
                                                     )}
                                                     
                                                     {/* Overlay Title */}
                                                     <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 rounded-b-xl">
                                                         <p className="text-[10px] text-white font-medium truncate">{fileName}</p>
                                                     </div>

                                                     {isEditing && (
                                                         <button 
                                                             onClick={(e) => { e.stopPropagation(); handleRemoveFile(fileItem.originalIndex); }}
                                                             className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 z-10 scale-90 hover:scale-100 transition-transform"
                                                         >
                                                             <CloseIcon />
                                                         </button>
                                                     )}
                                                 </div>
                                             );
                                         })}
                                         
                                         {/* Add File Placeholder (Visible only in Edit Mode) */}
                                         {isEditing && (
                                             <button 
                                                onClick={() => editFileInputRef.current?.click()}
                                                disabled={isProcessingFiles}
                                                className="aspect-[4/3] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:text-primary-500 hover:border-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all"
                                             >
                                                {isProcessingFiles ? (
                                                     <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                                                ) : (
                                                     <>
                                                        <PlusIcon />
                                                        <span className="text-[10px] font-bold mt-1">TAMBAH</span>
                                                     </>
                                                )}
                                             </button>
                                         )}
                                     </div>
                                     <input 
                                        type="file" 
                                        multiple 
                                        className="hidden" 
                                        ref={editFileInputRef} 
                                        onChange={handleAddFile} 
                                        accept=".jpg, .jpeg, .png, .webp, .pdf, .docx, .doc, .pptx, .ppt, .txt, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, text/plain"
                                     />
                                 </div>
                             )}

                             {/* Section: Main Content */}
                             <div className={`bg-white dark:bg-slate-900 rounded-2xl border ${isEditing ? 'border-primary-300 dark:border-primary-800 ring-4 ring-primary-50 dark:ring-primary-900/20' : 'border-slate-200 dark:border-slate-800'} shadow-sm min-h-[500px] transition-all`}>
                                 <div className="p-8 md:p-12">
                                     {isEditing ? (
                                         <textarea 
                                            value={editedContent}
                                            onChange={(e) => setEditedContent(e.target.value)}
                                            className="w-full h-[600px] bg-transparent border-none focus:ring-0 text-slate-800 dark:text-slate-200 font-mono text-sm leading-relaxed p-0 resize-none outline-none"
                                            placeholder="Tulis ringkasan atau materi catatan di sini..."
                                         />
                                     ) : (
                                         <article className="markdown-body">
                                             <ReactMarkdown 
                                                 remarkPlugins={[remarkGfm, remarkMath]} 
                                                 rehypePlugins={[rehypeKatex]}
                                                 components={{
                                                     // Typography styling to match modern clean reading experience
                                                     h1: ({children}) => <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-10 pb-6 border-b border-slate-100 dark:border-slate-800 tracking-tight leading-tight">{children}</h1>,
                                                     h2: ({children}) => <h2 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100 mt-16 mb-8 tracking-tight">{children}</h2>,
                                                     h3: ({children}) => <h3 className="text-xl md:text-2xl font-semibold text-slate-800 dark:text-slate-200 mt-12 mb-6">{children}</h3>,
                                                     p: ({children}) => <p className="mb-8 leading-loose text-slate-600 dark:text-slate-300 text-lg">{children}</p>,
                                                     ul: ({children}) => <ul className="list-disc pl-8 mb-8 space-y-4 text-slate-600 dark:text-slate-300 leading-8 text-lg">{children}</ul>,
                                                     ol: ({children}) => <ol className="list-decimal pl-8 mb-8 space-y-4 text-slate-600 dark:text-slate-300 leading-8 text-lg">{children}</ol>,
                                                     li: ({children}) => <li className="pl-2">{children}</li>,
                                                     strong: ({children}) => <strong className="font-bold text-slate-900 dark:text-white">{children}</strong>,
                                                     blockquote: ({children}) => <blockquote className="border-l-4 border-primary-500 pl-8 py-6 my-10 italic text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-r-2xl shadow-sm text-lg">{children}</blockquote>,
                                                     code: ({node, inline, className, children, ...props}: any) => {
                                                         const match = /language-(\w+)/.exec(className || '');
                                                         if (!inline) {
                                                            // Pass to pre for styling
                                                            return <code className={className} {...props}>{children}</code>;
                                                         }
                                                         return (
                                                            <code className="bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-2 py-1 rounded-md text-sm font-mono border border-slate-200 dark:border-slate-700 mx-1" {...props}>
                                                                {children}
                                                            </code>
                                                         );
                                                     },
                                                     pre: CustomPre
                                                 }}
                                             >
                                                 {formattedContent}
                                             </ReactMarkdown>
                                         </article>
                                     )}
                                 </div>
                             </div>
                         </div>
                     )}

                     {/* TAB: QUIZ */}
                     {activeTab === 'quiz' && !isEditing && (
                         <div className="max-w-3xl mx-auto animate-fade-in">
                             {!note.quiz || note.quiz.length === 0 ? (
                                 <div className="bg-white dark:bg-slate-900 rounded-2xl p-16 text-center border border-slate-200 dark:border-slate-800 border-dashed">
                                     <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                         <BookIcon />
                                     </div>
                                     <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Belum ada kuis</h3>
                                     <p className="mt-2 text-slate-500 dark:text-slate-400 max-w-sm mx-auto">Materi ini belum memiliki kuis otomatis. Coba buat ulang rangkuman untuk generate kuis.</p>
                                 </div>
                             ) : (
                                 <div className="space-y-8 pb-20">
                                     {showResults && (
                                         <div className="p-8 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl text-white text-center shadow-xl mb-8 relative overflow-hidden">
                                             <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                                             <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/10 rounded-full -ml-10 -mb-10 blur-3xl"></div>
                                             
                                             <p className="text-indigo-100 font-medium mb-1 uppercase tracking-widest text-xs relative z-10">Skor Pilihan Ganda</p>
                                             <div className="text-6xl font-extrabold mb-3 tracking-tighter relative z-10">{calculateScore()}</div>
                                             <div className="w-full bg-black/20 h-2 rounded-full max-w-xs mx-auto mb-6 overflow-hidden backdrop-blur-sm relative z-10">
                                                 <div className="bg-white h-full rounded-full transition-all duration-1000 ease-out" style={{width: `${calculateScore()}%`}}></div>
                                             </div>
                                             
                                             <button
                                                onClick={handleRegenerateQuiz}
                                                disabled={isRegenerating}
                                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white rounded-xl font-bold text-sm transition-all relative z-10"
                                             >
                                                {isRegenerating ? (
                                                    <>
                                                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                        Membuat Soal...
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon /> Buat Soal Baru
                                                    </>
                                                )}
                                             </button>
                                         </div>
                                     )}
                                     
                                     {isRegenerating ? (
                                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 flex flex-col items-center justify-center space-y-4 border border-slate-200 dark:border-slate-800">
                                            <div className="loading-wave">
                                                <div className="loading-bar"></div><div className="loading-bar"></div><div className="loading-bar"></div><div className="loading-bar"></div>
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400 font-medium">Sedang menyusun soal baru...</p>
                                        </div>
                                     ) : (
                                        <div className="space-y-6">
                                            {note.quiz.map((q, idx) => {
                                                const isEssay = q.type === 'essay';
                                                
                                                // Handle MCQ Rendering
                                                if (!isEssay && q.options) {
                                                    const userAnswer = quizAnswers[idx];
                                                    const isCorrect = userAnswer === q.answer;
                                                    
                                                    return (
                                                        <div key={idx} className={`rounded-2xl p-6 border transition-all duration-300 ${showResults ? (isCorrect ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800') : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
                                                            <div className="flex gap-4 mb-4">
                                                                <span className={`flex-shrink-0 w-8 h-8 rounded-lg font-bold flex items-center justify-center text-sm ${showResults ? (isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                                                    {idx + 1}
                                                                </span>
                                                                <div className="flex-1">
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 leading-relaxed markdown-body">
                                                                            <ReactMarkdown 
                                                                                remarkPlugins={[remarkGfm, remarkMath]} 
                                                                                rehypePlugins={[rehypeKatex]}
                                                                                components={questionRenderComponents}
                                                                            >
                                                                                {q.question}
                                                                            </ReactMarkdown>
                                                                        </div>
                                                                        {userAnswer !== undefined && !showResults && (
                                                                            <button onClick={() => handleResetQuestion(idx)} className="text-slate-400 hover:text-primary-600">
                                                                                <ReloadIcon />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <div className="space-y-3">
                                                                        {q.options.map((option, optIdx) => {
                                                                            let btnClass = "w-full text-left px-5 py-3.5 rounded-xl border text-sm transition-all font-medium ";
                                                                            
                                                                            if (showResults) {
                                                                                if (option === q.answer) btnClass += "bg-green-100 dark:bg-green-900/30 border-green-500 text-green-800 dark:text-green-200";
                                                                                else if (userAnswer === option && option !== q.answer) btnClass += "bg-red-100 dark:bg-red-900/30 border-red-400 text-red-800 dark:text-red-200";
                                                                                else btnClass += "bg-slate-50 dark:bg-slate-800/50 border-transparent text-slate-400 opacity-60";
                                                                            } else {
                                                                                if (userAnswer === option) btnClass += "bg-primary-50 dark:bg-primary-900/30 border-primary-500 text-primary-900 dark:text-primary-100 shadow-sm";
                                                                                else btnClass += "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300";
                                                                            }
                
                                                                            return (
                                                                                <button 
                                                                                    key={optIdx}
                                                                                    onClick={() => handleAnswer(idx, option)}
                                                                                    disabled={showResults}
                                                                                    className={btnClass}
                                                                                >
                                                                                    <div className="flex justify-between items-center">
                                                                                        <span>{option}</span>
                                                                                        {showResults && option === q.answer && <CheckIcon />}
                                                                                    </div>
                                                                                </button>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                    {showResults && (
                                                                        <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm">
                                                                            <strong className="text-slate-900 dark:text-white block mb-1">Pembahasan:</strong>
                                                                            {q.explanation}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                } 
                                                
                                                // Handle Essay Rendering
                                                return (
                                                    <div key={idx} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
                                                        <div className="flex gap-4 mb-4">
                                                            <span className="flex-shrink-0 w-8 h-8 rounded-lg font-bold flex items-center justify-center text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                                                                {idx + 1}
                                                            </span>
                                                            <div className="flex-1 w-full">
                                                                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 mb-1 block uppercase tracking-wider">Soal Esai</span>
                                                                <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 leading-relaxed markdown-body">
                                                                    <ReactMarkdown 
                                                                        remarkPlugins={[remarkGfm, remarkMath]} 
                                                                        rehypePlugins={[rehypeKatex]}
                                                                        components={questionRenderComponents}
                                                                    >
                                                                        {q.question}
                                                                    </ReactMarkdown>
                                                                </div>
                                                                
                                                                <textarea 
                                                                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none mb-4 resize-y min-h-[100px]"
                                                                    placeholder="Tulis jawabanmu di sini (untuk latihan mandiri)..."
                                                                ></textarea>

                                                                {essayRevealed[idx] ? (
                                                                    <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-5 animate-fade-in">
                                                                        <div className="flex justify-between items-start mb-2">
                                                                            <strong className="text-green-800 dark:text-green-300 text-sm">Kunci Jawaban / Poin Penting:</strong>
                                                                            <button onClick={() => toggleEssayAnswer(idx)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Sembunyikan</button>
                                                                        </div>
                                                                        <div className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-3">
                                                                            <ReactMarkdown>{q.answer}</ReactMarkdown>
                                                                        </div>
                                                                        {q.explanation && (
                                                                            <div className="text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-green-200 dark:border-green-800/30">
                                                                                <span className="font-semibold">Info Tambahan:</span> {q.explanation}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => toggleEssayAnswer(idx)}
                                                                        className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                                                    >
                                                                        👁️ Lihat Kunci Jawaban
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                     )}
 
                                     {!isRegenerating && (
                                         <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 md:translate-x-0 md:left-auto md:right-10 z-30">
                                             {!showResults ? (
                                                 <button 
                                                     onClick={() => setShowResults(true)}
                                                     disabled={Object.keys(quizAnswers).length < countMCQ}
                                                     className="px-8 py-3 bg-primary-600 text-white font-bold rounded-full shadow-xl shadow-primary-200 dark:shadow-none hover:bg-primary-700 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-1 hover:scale-105"
                                                 >
                                                     Cek Hasil Pilihan Ganda ({Object.keys(quizAnswers).length}/{countMCQ})
                                                 </button>
                                             ) : (
                                                 <button 
                                                     onClick={() => {
                                                         setShowResults(false);
                                                         setQuizAnswers({});
                                                         setEssayRevealed({});
                                                         window.scrollTo({top: 0, behavior: 'smooth'});
                                                     }}
                                                     className="px-8 py-3 bg-slate-800 dark:bg-slate-700 text-white font-bold rounded-full shadow-xl hover:bg-slate-900 dark:hover:bg-slate-600 transition-all transform hover:-translate-y-1 hover:scale-105"
                                                 >
                                                     Ulangi Kuis
                                                 </button>
                                             )}
                                         </div>
                                     )}
                                 </div>
                             )}
                         </div>
                     )}
                 </div>
             </div>
        </div>
    );
};