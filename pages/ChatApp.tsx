import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// @ts-ignore
import mammoth from 'mammoth';
// @ts-ignore
import JSZip from 'jszip';
import { Sidebar } from '../components/Sidebar';
import { ChatBubble } from '../components/ChatBubble';
import { SendIcon, MenuIcon, PhotoIcon, TrashIcon, ClearIcon, PlusIcon, BookIcon, SortIcon, SearchIcon, FileIcon, CloseIcon, CheckIcon, SparklesIcon, ReloadIcon, CloudIcon, GoogleDriveIcon, DropboxIcon, MicIcon, StopIcon, VideoIcon, SettingsIcon, KeyIcon } from '../components/Icons';
import { Message, LearningMode, VisionFile, ChatSession, AppView, Note, QuizQuestion, User } from '../types';
import { streamGeminiResponse, generateNoteSummary, regenerateQuiz } from '../services/geminiService';
import { db } from '../services/db';
import { initGoogleDrive, requestAccessToken, uploadFileToDrive } from '../services/driveService';
import { NoteDetailPage } from './NoteDetailPage';

type SortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc';

interface ChatAppProps {
    user: User | null;
    onSignOut: () => void;
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const WaveThinkingIndicator = () => (
  <div className="flex items-center gap-4 ml-14 mb-8">
      <div className="loading-wave">
          <div className="loading-bar"></div>
          <div className="loading-bar"></div>
          <div className="loading-bar"></div>
          <div className="loading-bar"></div>
      </div>
      <span className="text-sm text-slate-500 dark:text-slate-400 font-medium animate-pulse">PintarAI sedang menganalisis...</span>
  </div>
);

export const ChatApp: React.FC<ChatAppProps> = ({ user, onSignOut, theme, toggleTheme }) => {
  // App State
  const [view, setView] = useState<AppView>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Chat State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<LearningMode>(LearningMode.GENERAL);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingQuiz, setIsCreatingQuiz] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  // Notes State
  const [notes, setNotes] = useState<Note[]>([]);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'session' | 'note' | null;
    itemId: string | null;
    itemTitle: string;
  }>({
    isOpen: false,
    type: null,
    itemId: null,
    itemTitle: ''
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // --- Persistence & Init ---
  useEffect(() => {
    const loadData = async () => {
        try {
            const savedSessions = await db.getAllSessions();
            setSessions(savedSessions);
            const savedNotes = await db.getAllNotes();
            setNotes(savedNotes);
        } catch (err) {
            console.error("Failed to load data from DB", err);
        }
    };
    loadData();

    // Check for API Key
    const localKey = localStorage.getItem('gemini_api_key');
    if (localKey) setApiKeyInput(localKey);
  }, []);

  const handleSaveApiKey = () => {
      if (apiKeyInput.trim()) {
          localStorage.setItem('gemini_api_key', apiKeyInput.trim());
      } else {
          localStorage.removeItem('gemini_api_key');
      }
      setShowSettings(false);
      alert("API Key berhasil disimpan!");
      window.location.reload(); // Reload to ensure services pick up the new key
  };

  // --- Calculate Token Usage ---
  const totalTokenUsage = useMemo(() => {
      // Calculate from current visible messages
      const currentSessionUsage = messages.reduce((acc, msg) => acc + (msg.usage?.totalTokens || 0), 0);
      
      // We could also calculate from all sessions if we loaded them all fully, 
      // but typically we just want to track the current active usage + what we know.
      // For a simple counter, let's sum up tokens from all sessions we have loaded in state.
      // Note: This is client-side only tracking.
      let allSessionsUsage = sessions.reduce((acc, session) => {
           // Avoid double counting current session if it's already in the sessions list
           if (session.id === currentSessionId) return acc;
           return acc + session.messages.reduce((mAcc, msg) => mAcc + (msg.usage?.totalTokens || 0), 0);
      }, 0);

      return allSessionsUsage + currentSessionUsage;
  }, [messages, sessions, currentSessionId]);

  // --- Chat Logic ---

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, view, searchQuery]);

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setView('chat');
    setSearchQuery('');
  };

  const confirmDelete = async () => {
    if (!deleteModal.itemId || !deleteModal.type) return;

    if (deleteModal.type === 'session') {
        await db.deleteSession(deleteModal.itemId);
        const updated = sessions.filter(s => s.id !== deleteModal.itemId);
        setSessions(updated);
        if (currentSessionId === deleteModal.itemId) {
            setMessages([]);
            setCurrentSessionId(null);
        }
    } else if (deleteModal.type === 'note') {
        await db.deleteNote(deleteModal.itemId);
        setNotes(prev => prev.filter(n => n.id !== deleteModal.itemId));
        if (selectedNote?.id === deleteModal.itemId) {
            setSelectedNote(null);
            setView('notes');
        }
    }
    
    setDeleteModal({ isOpen: false, type: null, itemId: null, itemTitle: '' });
  };

  const handleDeleteSession = (id: string) => {
      const session = sessions.find(s => s.id === id);
      setDeleteModal({
          isOpen: true,
          type: 'session',
          itemId: id,
          itemTitle: session?.title || 'Sesi ini'
      });
  };

  const clearChat = async () => {
    if (messages.length > 0) {
      if (window.confirm("Bersihkan obrolan saat ini? Semua pesan dalam tampilan ini akan dihapus.")) {
        setMessages([]);
        setCurrentSessionId(null);
        clearFiles();
        setSearchQuery('');
      }
    }
  };

  const handleCreateQuiz = async (text: string) => {
      setIsCreatingQuiz(true);
      try {
          const quiz = await regenerateQuiz(text);
          if (quiz && quiz.length > 0) {
              const quizMessage: Message = {
                  id: Date.now().toString(),
                  role: 'model',
                  text: "Berikut adalah kuis singkat berdasarkan penjelasan di atas. Selamat mengerjakan!",
                  timestamp: Date.now(),
                  quiz: quiz
              };
              setMessages(prev => [...prev, quizMessage]);
              
              // Update session if needed
              if (currentSessionId) {
                  const updatedSessions = sessions.map(s => {
                      if (s.id === currentSessionId) {
                          const updated = { ...s, messages: [...s.messages, quizMessage], lastModified: Date.now() };
                          db.saveSession(updated); // Sync DB
                          return updated;
                      }
                      return s;
                  });
                  setSessions(updatedSessions);
              }
          } else {
              alert("Gagal membuat kuis. Mohon coba lagi.");
          }
      } catch (error) {
          console.error("Quiz creation error:", error);
          alert("Terjadi kesalahan saat menghubungi AI. Pastikan API Key valid.");
      } finally {
          setIsCreatingQuiz(false);
      }
  };

  // --- File Handling Helpers ---

  const isVisualFile = (file: File) => {
    return file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type === 'application/pdf';
  };

  const isDocxFile = (file: File) => {
    return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  };
  
  const isPptxFile = (file: File) => {
    return file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  };

  const isLegacyBinaryFile = (file: File) => {
    const name = file.name.toLowerCase();
    const type = file.type;
    return (
        type === 'application/msword' || 
        type === 'application/vnd.ms-powerpoint' ||
        name.endsWith('.doc') || 
        name.endsWith('.ppt')
    );
  };

  const extractTextFromPptx = async (file: File): Promise<string> => {
    try {
        const zip = await JSZip.loadAsync(file);
        const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
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
            const texts = xmlDoc.getElementsByTagName("a:t");
            let slideText = "";
            for (let i = 0; i < texts.length; i++) {
                slideText += texts[i].textContent + " ";
            }
            if (slideText.trim()) {
                fullText += `[Slide ${slideFile.replace('ppt/slides/', '').replace('.xml','')}]\n${slideText.trim()}\n\n`;
            }
        }
        return fullText;
    } catch (e) {
        console.error("PPTX Parsing Error", e);
        throw new Error("Gagal membaca struktur file PPTX. File mungkin korup.");
    }
  };

  const processFileSelection = async (files: File[]) => {
    const visualFiles: File[] = [];
    const textConversionFiles: File[] = [];
    const legacyFiles: string[] = [];
    const unknownFiles: string[] = [];

    files.forEach(f => {
      if (isVisualFile(f)) {
        visualFiles.push(f);
      } else if (isDocxFile(f) || isPptxFile(f)) {
        textConversionFiles.push(f);
      } else if (isLegacyBinaryFile(f)) {
        legacyFiles.push(f.name);
      } else {
        unknownFiles.push(f.name);
      }
    });

    if (legacyFiles.length > 0) {
      alert(`File format lama tidak didukung (.doc/.ppt). Harap konversi ke .docx/.pptx.`);
    }

    if (visualFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...visualFiles]);
      visualFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          setPreviewUrls(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }

    if (textConversionFiles.length > 0) {
      setIsLoading(true);
      for (const file of textConversionFiles) {
        try {
          let textContent = "";
          if (isDocxFile(file)) {
             const arrayBuffer = await file.arrayBuffer();
             const result = await mammoth.extractRawText({ arrayBuffer });
             textContent = `\n\n--- Isi Dokumen Word (${file.name}) ---\n${result.value}\n--- Akhir Dokumen ---\n`;
          } else if (isPptxFile(file)) {
             const extracted = await extractTextFromPptx(file);
             textContent = `\n\n--- Isi Slide PowerPoint (${file.name}) ---\n${extracted}\n--- Akhir Slide ---\n`;
          }
          setInput(prev => prev + textContent);
        } catch (err: any) {
          console.error("File Conversion Error", err);
          alert(`Gagal membaca file ${file.name}`);
        }
      }
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      processFileSelection(files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            const blob = item.getAsFile();
            if (blob) files.push(blob);
        }
    }
    if (files.length > 0) {
        e.preventDefault();
        processFileSelection(files);
    }
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setPreviewUrls([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // --- Audio Recording ---
  const startRecording = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          const chunks: BlobPart[] = [];

          mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
          };

          mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'audio/webm' });
              // Treat audio as a file upload
              const audioFile = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
              processFileSelection([audioFile]);
              
              // Stop all tracks
              stream.getTracks().forEach(track => track.stop());
          };

          mediaRecorder.start();
          setIsRecording(true);
      } catch (err) {
          console.error("Mic Access Error", err);
          alert("Gagal mengakses mikrofon. Pastikan izin diberikan.");
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  const handleSend = async () => {
    if ((!input.trim() && selectedFiles.length === 0) || isLoading) return;

    const userText = input.trim();
    const currentPreviews = [...previewUrls];
    
    setInput('');
    clearFiles();
    setSearchQuery('');

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
      images: currentPreviews.length > 0 ? currentPreviews : undefined,
      timestamp: Date.now()
    };

    const newHistory = [...messages, newUserMessage];
    setMessages(newHistory);
    setIsLoading(true);

    const visionFiles: VisionFile[] = currentPreviews.map(url => {
        const [header, data] = url.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        return { data, mimeType };
    });

    const aiMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
        id: aiMessageId,
        role: 'model',
        text: '',
        timestamp: Date.now()
    }]);

    let accumulatedText = "";
    let usageData = undefined;

    await streamGeminiResponse(
      newHistory.slice(0, -1),
      userText,
      visionFiles,
      mode,
      (chunk) => {
        accumulatedText += chunk;
        setMessages(prev => prev.map(msg => 
          msg.id === aiMessageId ? { ...msg, text: accumulatedText } : msg
        ));
      },
      (usage) => {
          usageData = usage;
      }
    );

    setMessages(prev => {
        const updatedMessages = prev.map(msg => 
            msg.id === aiMessageId ? { ...msg, text: accumulatedText, usage: usageData } : msg
        );
        
        const currentId = currentSessionId || Date.now().toString();
        let fileLabel = 'Lampiran';
        if (visionFiles.length > 0) {
            const mime = visionFiles[0].mimeType;
            if (mime.includes('pdf')) fileLabel = 'Dokumen PDF';
            else if (mime.startsWith('audio')) fileLabel = 'Rekaman Audio';
            else if (mime.startsWith('video')) fileLabel = 'Video';
            else fileLabel = 'Gambar';
        }

        const title = currentSessionId 
            ? sessions.find(s => s.id === currentId)?.title || "Percakapan Baru" 
            : (userText.slice(0, 30) || fileLabel) + "...";

        const updatedSession: ChatSession = {
            id: currentId,
            title: title,
            messages: updatedMessages,
            lastModified: Date.now()
        };

        if (!currentSessionId) setCurrentSessionId(currentId);
        
        setSessions(prevSessions => {
            const exists = prevSessions.find(s => s.id === currentId);
            if (exists) {
                db.saveSession(updatedSession);
                return prevSessions.map(s => s.id === currentId ? updatedSession : s);
            }
            db.saveSession(updatedSession);
            return [...prevSessions, updatedSession];
        });

        return updatedMessages;
    });

    setIsLoading(false);
  };

  const visibleMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter(msg => 
      msg.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [messages, searchQuery]);


  // --- Notes Logic ---
  const handleUpdateNote = async (updatedNote: Note) => {
      await db.saveNote(updatedNote); 
      setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
      setSelectedNote(updatedNote);
  };

  const handleDeleteNote = (id: string, title: string) => {
      setDeleteModal({
          isOpen: true,
          type: 'note',
          itemId: id,
          itemTitle: title
      });
  };

  // Wrapper for the note detail page delete handler
  const handleDeleteNoteDetail = (id: string, title: string) => {
       handleDeleteNote(id, title);
  };

  const handleCreateNote = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []) as File[];
    const visualFiles = rawFiles.filter(isVisualFile);
    const textFiles = rawFiles.filter(f => isDocxFile(f) || isPptxFile(f));
    
    if (visualFiles.length === 0 && textFiles.length === 0) {
        if (noteFileInputRef.current) noteFileInputRef.current.value = '';
        return;
    }

    setIsCreatingNote(true);

    let contextFromTextFiles = "";
    const sourceNames: string[] = [];

    if (textFiles.length > 0) {
        for (const file of textFiles) {
            sourceNames.push(file.name);
            try {
                if (isDocxFile(file)) {
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    contextFromTextFiles += `\n\nDokumen ${file.name}:\n${result.value}`;
                } else if (isPptxFile(file)) {
                    const extracted = await extractTextFromPptx(file);
                    contextFromTextFiles += `\n\nSlide ${file.name}:\n${extracted}`;
                }
            } catch (err: any) {
                console.error("Note Text Extraction Error", err);
                alert(`Gagal membaca file ${file.name}`);
            }
        }
    }

    const processedFiles: VisionFile[] = await Promise.all(visualFiles.map(file => {
        sourceNames.push(file.name);
        return new Promise<VisionFile>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                const res = reader.result as string;
                const [header, data] = res.split(',');
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                resolve({ data, mimeType });
            };
            reader.readAsDataURL(file);
        });
    }));

    const { title, content, quiz } = await generateNoteSummary(processedFiles, contextFromTextFiles);
    
    const newNote: Note = {
        id: Date.now().toString(),
        title: title || `Catatan ${new Date().toLocaleDateString()}`,
        content: content,
        quiz: quiz,
        originalFiles: processedFiles.map(f => `data:${f.mimeType};base64,${f.data}`),
        sourceFileNames: sourceNames,
        createdAt: Date.now()
    };

    await db.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setIsCreatingNote(false);
    setSelectedNote(newNote);
    setView('note-detail');
    if (noteFileInputRef.current) noteFileInputRef.current.value = '';
  };

  const deleteNote = (id: string, e: React.MouseEvent, title: string) => {
      e.stopPropagation();
      handleDeleteNote(id, title);
  };

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
        switch (sortOption) {
            case 'date-desc': return b.createdAt - a.createdAt;
            case 'date-asc': return a.createdAt - b.createdAt;
            case 'title-asc': return a.title.localeCompare(b.title);
            case 'title-desc': return b.title.localeCompare(a.title);
            default: return 0;
        }
    });
  }, [notes, sortOption]);

  const renderPreview = (url: string, index: number) => {
    const mime = url.match(/:(.*?);/)?.[1] || '';
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    
    return (
        <div key={index} className="relative group w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            {isImage ? (
                <img src={url} alt="Preview" className="w-full h-full object-cover" />
            ) : isVideo ? (
                <video src={url} className="w-full h-full object-cover" muted />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                    {mime.startsWith('audio/') ? <MicIcon /> : <FileIcon />}
                    <span className="text-[9px] font-bold mt-1 uppercase truncate w-full text-center px-1">{mime.split('/')[1] || 'FILE'}</span>
                </div>
            )}
            <button 
                onClick={() => removeFile(index)}
                className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-0.5 rounded-full backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
            >
                <div className="transform scale-75">
                   <CloseIcon />
                </div>
            </button>
        </div>
    );
  };

  const setModeAndFocus = (newMode: LearningMode) => {
      setMode(newMode);
  };

  // --- RENDER ---
  
  if (view === 'note-detail' && selectedNote) {
      return (
          <NoteDetailPage 
              note={selectedNote} 
              onBack={() => setView('notes')}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNoteDetail}
          />
      );
  }

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 overflow-hidden relative transition-colors duration-300">
      
      {/* Settings Modal */}
      {showSettings && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
             <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800 relative">
                 <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon /></button>
                 
                 <div className="flex flex-col items-center text-center mb-6">
                     <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center mb-3">
                        <SettingsIcon />
                     </div>
                     <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Pengaturan API Key</h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Masukkan Google Gemini API Key Anda agar aplikasi dapat berjalan tanpa batasan.
                     </p>
                 </div>
                 
                 <div className="space-y-4">
                     <div>
                         <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 ml-1">Gemini API Key</label>
                         <div className="relative">
                             <div className="absolute left-3 top-3 text-slate-400">
                                 <KeyIcon />
                             </div>
                             <input 
                                type="password" 
                                value={apiKeyInput}
                                onChange={(e) => setApiKeyInput(e.target.value)}
                                placeholder="tempel AIzaSy..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-slate-800 dark:text-slate-200 text-sm"
                             />
                         </div>
                         <p className="text-xs text-slate-400 mt-2 px-1">
                             Key ini disimpan secara lokal di browser Anda (LocalStorage) dan tidak dikirim ke server manapun selain Google.
                         </p>
                     </div>
                     
                     <button 
                        onClick={handleSaveApiKey}
                        className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-200 dark:shadow-none transition-all active:scale-95"
                     >
                        Simpan Pengaturan
                     </button>
                     
                     <div className="text-center pt-2">
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                            Dapatkan API Key di sini &rarr;
                        </a>
                     </div>
                 </div>
             </div>
         </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
             <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100 border border-slate-100 dark:border-slate-800">
                 <div className="flex flex-col items-center text-center">
                     <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-full flex items-center justify-center mb-4">
                        <TrashIcon />
                     </div>
                     <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
                        Hapus {deleteModal.type === 'session' ? 'Sesi Obrolan' : 'Catatan'}?
                     </h3>
                     <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        Anda akan menghapus "<strong>{deleteModal.itemTitle}</strong>". <br/>
                        Tindakan ini tidak dapat dibatalkan.
                     </p>
                     
                     <div className="flex gap-3 w-full">
                         <button 
                            onClick={() => setDeleteModal({ ...deleteModal, isOpen: false })}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                         >
                            Batal
                         </button>
                         <button 
                            onClick={confirmDelete}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 shadow-lg shadow-red-200 dark:shadow-none transition-colors"
                         >
                            Ya, Hapus
                         </button>
                     </div>
                 </div>
             </div>
         </div>
      )}

      <Sidebar 
        currentMode={mode} 
        setMode={setMode} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        clearChat={clearChat}
        currentView={view}
        setView={setView}
        sessions={sessions}
        loadSession={loadSession}
        currentSessionId={currentSessionId}
        deleteSession={handleDeleteSession}
        user={user}
        onSignOut={onSignOut}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        totalTokenUsage={totalTokenUsage}
      />

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full relative md:ml-72 transition-all duration-300">
        
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <MenuIcon />
            </button>
            <div className="flex flex-col">
                <h2 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                    {view === 'chat' ? (mode === LearningMode.INTERACTIVE ? 'Q&A Interaktif' : mode) : 'Notebook Saya'}
                </h2>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                   {view === 'chat' ? (currentSessionId ? 'Sesi Tersimpan' : 'Sesi Baru') : `${notes.length} Catatan`}
                </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
             {view === 'chat' && (
                <>
                  <div className="hidden md:block">
                     <select 
                        value={mode} 
                        onChange={(e) => setMode(e.target.value as LearningMode)}
                        className="text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300 outline-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        {Object.values(LearningMode).map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                  </div>

                  {messages.length > 0 && (
                    <div className="relative group">
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari..."
                            className={`pl-8 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full border-none focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 transition-all ${searchQuery ? 'w-48' : 'w-10 focus:w-48'} cursor-pointer focus:cursor-text`}
                        />
                        <div className="absolute left-2.5 top-2 text-slate-400 dark:text-slate-500 pointer-events-none">
                            <SearchIcon />
                        </div>
                    </div>
                  )}
                  
                  <button onClick={() => clearChat()} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors" title="Bersihkan Chat">
                      <ClearIcon />
                  </button>
                </>
             )}
          </div>
        </header>

        {/* View Content */}
        {view === 'chat' ? (
            <>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 dark:bg-slate-950">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-100 px-4">
                        <div className="mb-8 relative">
                             <div className="w-20 h-20 bg-gradient-to-tr from-primary-400 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-200 dark:shadow-none mx-auto rotate-3">
                                <span className="text-4xl text-white">🎓</span>
                             </div>
                             <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center shadow-sm">
                                <SparklesIcon />
                             </div>
                        </div>

                      <h3 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 mb-3 tracking-tight">
                        Selamat Datang di PintarAI
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 max-w-md mb-10 text-lg">
                        Asisten belajar pintar yang siap membantumu. Mau belajar apa hari ini?
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                          <button 
                            onClick={() => setModeAndFocus(LearningMode.MATH)}
                            className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md transition-all group text-left"
                          >
                              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                  📐
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Bedah Soal Matematika</h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Foto soalmu, dapatkan cara pengerjaannya.</p>
                              </div>
                          </button>

                          <button 
                            onClick={() => setModeAndFocus(LearningMode.WRITING)}
                            className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md transition-all group text-left"
                          >
                              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                  📝
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Bantu Tulis Esai</h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Buat kerangka atau perbaiki tata bahasa.</p>
                              </div>
                          </button>

                          <button 
                            onClick={() => setModeAndFocus(LearningMode.SUMMARIZER)}
                            className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md transition-all group text-left"
                          >
                              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                  📚
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Ringkas Materi</h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Upload PDF/PPT, jadikan catatan rapi.</p>
                              </div>
                          </button>

                          <button 
                            onClick={() => setModeAndFocus(LearningMode.INTERACTIVE)}
                            className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md transition-all group text-left"
                          >
                              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                  🧠
                              </div>
                              <div>
                                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Q&A & Kuis Interaktif</h4>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">Tanya jawab konsep + tes pemahaman.</p>
                              </div>
                          </button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-3xl mx-auto">
                      {visibleMessages.map((msg) => (
                        <ChatBubble 
                            key={msg.id} 
                            message={msg} 
                            highlightText={searchQuery} 
                            onCreateQuiz={handleCreateQuiz}
                            isCreatingQuiz={isCreatingQuiz}
                        />
                      ))}
                      
                      {visibleMessages.length === 0 && searchQuery && (
                          <div className="text-center py-10 text-slate-400 dark:text-slate-500">
                              Tidak ada pesan yang cocok dengan "{searchQuery}"
                          </div>
                      )}

                      {isLoading && messages[messages.length - 1].role === 'user' && !searchQuery && (
                         <WaveThinkingIndicator />
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                  <div className="max-w-3xl mx-auto flex flex-col gap-2">
                    {/* File Previews */}
                    {previewUrls.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {previewUrls.map((url, idx) => renderPreview(url, idx))}
                      </div>
                    )}
                    
                    <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-2xl border border-transparent focus-within:border-primary-300 dark:focus-within:border-primary-700 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:ring-4 focus-within:ring-primary-100 dark:focus-within:ring-primary-900/30 transition-all">
                      {/* Media Actions */}
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-slate-400 hover:text-primary-600 dark:text-slate-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-colors"
                        title="Upload File"
                      >
                        <PhotoIcon />
                      </button>
                      <input 
                        type="file" 
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden" 
                        accept=".jpg, .jpeg, .png, .webp, .pdf, .docx, .doc, .pptx, .ppt, .mp4, .webm, .mov, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, video/*"
                      />

                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-3 rounded-xl transition-all ${isRecording ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 animate-pulse ring-2 ring-red-200 dark:ring-red-900' : 'text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'}`}
                        title={isRecording ? "Stop Recording" : "Start Recording"}
                      >
                        {isRecording ? <StopIcon /> : <MicIcon />}
                      </button>
                      
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={isRecording ? "Sedang merekam suara..." : "Ketik pesan..."}
                        className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 max-h-32 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                        rows={1}
                        style={{ minHeight: '44px' }}
                      />

                      <button 
                        onClick={handleSend}
                        disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
                        className="p-3 bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-200 dark:shadow-none hover:bg-primary-700 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-105 active:scale-95"
                      >
                        <SendIcon />
                      </button>
                    </div>
                  </div>
                </div>
            </>
        ) : (
            // --- NOTES GRID VIEW ---
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50 dark:bg-slate-950">
                <div className="max-w-5xl mx-auto">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Koleksi Catatan</h1>
                            <p className="text-slate-500 dark:text-slate-400">Unggah materi, AI akan merangkum dan membuatkan kuis latihan.</p>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                             <div className="relative group">
                                <select 
                                    value={sortOption}
                                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                                    className="appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 pl-9 pr-8 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 cursor-pointer text-sm font-medium shadow-sm hover:border-slate-300 dark:hover:border-slate-700"
                                >
                                    <option value="date-desc">Terbaru</option>
                                    <option value="date-asc">Terlama</option>
                                    <option value="title-asc">Judul (A-Z)</option>
                                    <option value="title-desc">Judul (Z-A)</option>
                                </select>
                                <div className="absolute left-3 top-3.5 text-slate-400">
                                    <SortIcon />
                                </div>
                             </div>

                             <button 
                                onClick={() => noteFileInputRef.current?.click()}
                                disabled={isCreatingNote}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 disabled:opacity-70"
                             >
                                {isCreatingNote ? (
                                    <>
                                        <div className="flex gap-1">
                                            <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
                                            <span className="w-2 h-2 bg-white rounded-full animate-bounce delay-100"></span>
                                            <span className="w-2 h-2 bg-white rounded-full animate-bounce delay-200"></span>
                                        </div>
                                        <span className="text-sm">Memproses...</span>
                                    </>
                                ) : (
                                    <>
                                        <PlusIcon /> <span className="hidden md:inline">Buat Catatan</span> <span className="md:hidden">Baru</span>
                                    </>
                                )}
                             </button>
                             <input 
                                type="file" 
                                multiple
                                ref={noteFileInputRef}
                                onChange={handleCreateNote}
                                className="hidden" 
                                accept=".jpg, .jpeg, .png, .webp, .pdf, .docx, .doc, .pptx, .ppt, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation"
                              />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {sortedNotes.length === 0 && !isCreatingNote && (
                            <div className="col-span-full text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                                <BookIcon />
                                <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300 mt-4">Belum ada catatan</h3>
                                <p className="text-slate-400 dark:text-slate-500">Yuk mulai upload materimu sekarang!</p>
                            </div>
                        )}
                        
                        {sortedNotes.map(note => (
                            <div 
                                key={note.id} 
                                onClick={() => {
                                    setSelectedNote(note);
                                    setView('note-detail');
                                }}
                                className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 cursor-pointer transition-all group relative"
                            >
                                <button 
                                    onClick={(e) => deleteNote(note.id, e, note.title)}
                                    className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                >
                                    <TrashIcon />
                                </button>
                                <div className="flex gap-2 mb-4 overflow-hidden">
                                    {note.originalFiles.slice(0, 3).map((file, i) => {
                                        const mime = file.match(/:(.*?);/)?.[1] || '';
                                        const isImage = mime.startsWith('image/');
                                        const fileName = note.sourceFileNames?.[i] || 'File';
                                        
                                        if (!isImage) {
                                            let iconColor = 'text-slate-400 dark:text-slate-500';
                                            if (mime.includes('pdf')) iconColor = 'text-red-500';
                                            
                                            return (
                                                <div key={i} title={fileName} className={`w-12 h-12 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center ${iconColor}`}>
                                                    <FileIcon />
                                                </div>
                                            );
                                        }
                                        return <img key={i} src={file} className="w-12 h-12 rounded-lg object-cover border border-slate-100 dark:border-slate-700" />;
                                    })}
                                    {note.originalFiles.length > 3 && (
                                        <div className="w-12 h-12 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-500 font-medium">
                                            +{note.originalFiles.length - 3}
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-2 line-clamp-1">{note.title}</h3>
                                
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                     <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(note.createdAt).toLocaleDateString()}</span>
                                    {note.sourceFileNames && note.sourceFileNames.length > 0 && (
                                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 truncate max-w-[150px]">
                                           {note.sourceFileNames[0]}
                                        </span>
                                    )}
                                </div>

                                <div className="max-h-24 overflow-hidden relative opacity-70">
                                    <div className="markdown-body text-xs line-clamp-3 pointer-events-none">
                                        <ReactMarkdown>{note.content}</ReactMarkdown>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-slate-900 to-transparent"></div>
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <span className="text-primary-600 dark:text-primary-400 text-sm font-semibold group-hover:underline">
                                        Buka Ringkasan &rarr;
                                    </span>
                                    {note.quiz && note.quiz.length > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                                            🧠 {note.quiz.length} Soal
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};