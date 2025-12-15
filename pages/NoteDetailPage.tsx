import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Note, QuizQuestion } from '../types';
import { CloseIcon, CheckIcon, CloudIcon, GoogleDriveIcon, DropboxIcon, FileIcon, ReloadIcon, SparklesIcon, BookIcon, TrashIcon } from '../components/Icons';
import { regenerateQuiz } from '../services/geminiService';
import { initGoogleDrive, requestAccessToken, uploadFileToDrive } from '../services/driveService';

interface NoteDetailPageProps {
    note: Note;
    onBack: () => void;
    onUpdateNote: (updatedNote: Note) => void;
    onDeleteNote: (id: string, title: string) => void;
}

export const NoteDetailPage: React.FC<NoteDetailPageProps> = ({ note, onBack, onUpdateNote, onDeleteNote }) => {
    const [activeTab, setActiveTab] = useState<'summary' | 'quiz'>('summary');
    const [quizAnswers, setQuizAnswers] = useState<{[key: number]: string}>({});
    const [showResults, setShowResults] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    
    // Cloud Sync State
    const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editedTitle, setEditedTitle] = useState(note.title);
    const [editedContent, setEditedContent] = useState(note.content);
    const [editedFiles, setEditedFiles] = useState<string[]>(note.originalFiles || []);
    // New: Track filenames during edit to ensure they don't get lost
    const [editedSourceNames, setEditedSourceNames] = useState<string[]>(note.sourceFileNames || []); 
    
    const editFileInputRef = useRef<HTMLInputElement>(null);

    // Initialize Google Drive Client
    useEffect(() => {
        initGoogleDrive(async (token) => {
            setIsSyncing(true);
            try {
                await uploadFileToDrive(note.title, note.content, token);
                const updatedNote = { ...note, syncedTo: 'google' as const };
                onUpdateNote(updatedNote);
                alert("Berhasil disimpan ke Google Drive!");
                setIsCloudModalOpen(false);
            } catch (error) {
                console.error(error);
                alert("Gagal mengupload ke Google Drive. Pastikan Client ID valid.");
            } finally {
                setIsSyncing(false);
            }
        });
    }, [note, onUpdateNote]);

    // Reset edit state when note changes or when canceling edit
    useEffect(() => {
        setEditedTitle(note.title);
        setEditedContent(note.content);
        setEditedFiles(note.originalFiles || []);
        setEditedSourceNames(note.sourceFileNames || []);
    }, [note, isEditing]);

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

    const calculateScore = () => {
        if (!note.quiz) return 0;
        let correct = 0;
        note.quiz.forEach((q, idx) => {
            if (quizAnswers[idx] === q.answer) correct++;
        });
        return Math.round((correct / note.quiz.length) * 100);
    };

    const handleRegenerateQuiz = async () => {
        if (isRegenerating) return;
        setIsRegenerating(true);
        try {
            const newQuiz = await regenerateQuiz(note.content);
            if (newQuiz && newQuiz.length > 0) {
                const updatedNote = { ...note, quiz: newQuiz };
                onUpdateNote(updatedNote);
                setQuizAnswers({});
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

    // Edit Logic
    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        if (files.length === 0) return;

        const newFilesData: string[] = [];
        const newFileNames: string[] = [];

        // Process files sequentially to maintain order and wait for reading
        for (const file of files) {
            try {
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
            } catch (err) {
                console.error("Error reading file:", file.name, err);
            }
        }

        setEditedFiles(prev => [...prev, ...newFilesData]);
        setEditedSourceNames(prev => [...prev, ...newFileNames]);
        
        // Reset input
        e.target.value = '';
    };

    const handleRemoveFile = (index: number) => {
        setEditedFiles(prev => prev.filter((_, i) => i !== index));
        setEditedSourceNames(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        const updatedNote: Note = {
            ...note,
            title: editedTitle,
            content: editedContent,
            originalFiles: editedFiles,
            sourceFileNames: editedSourceNames, // Persist the updated filenames
        };
        onUpdateNote(updatedNote);
        setIsEditing(false);
    };

    const handleCloudSync = async (provider: 'google' | 'dropbox') => {
        if (provider === 'google') {
            requestAccessToken();
        } else {
            setIsSyncing(true);
            // Simulation
            await new Promise(resolve => setTimeout(resolve, 2000));
            const updatedNote = { ...note, syncedTo: provider };
            onUpdateNote(updatedNote);
            
            setIsSyncing(false);
            setIsCloudModalOpen(false);
            alert(`Berhasil disinkronkan ke Dropbox!`);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 animate-fade-in relative transition-colors duration-300">
             {/* Cloud Sync Modal */}
             {isCloudModalOpen && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                     <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all scale-100 border border-slate-200 dark:border-slate-800">
                         <div className="flex justify-between items-center mb-4">
                             <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Simpan ke Cloud</h3>
                             <button onClick={() => !isSyncing && setIsCloudModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                 <CloseIcon />
                             </button>
                         </div>
                         <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                             Pilih layanan penyimpanan cloud untuk menyadangkan catatan ini.
                         </p>
                         
                         <div className="space-y-3">
                             <button 
                                onClick={() => handleCloudSync('google')}
                                disabled={isSyncing}
                                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-200 transition-all group disabled:opacity-60"
                             >
                                <div className="p-2 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                   <GoogleDriveIcon />
                                </div>
                                <div className="text-left flex-1">
                                    <div className="font-semibold text-slate-700 dark:text-slate-200">Google Drive</div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500">Akun Google Anda</div>
                                </div>
                                {isSyncing && <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-blue-500"></div>}
                             </button>

                             <button 
                                onClick={() => handleCloudSync('dropbox')}
                                disabled={isSyncing}
                                className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-200 transition-all group disabled:opacity-60"
                             >
                                <div className="p-2 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                   <DropboxIcon />
                                </div>
                                <div className="text-left flex-1">
                                    <div className="font-semibold text-slate-700 dark:text-slate-200">Dropbox</div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500">Hubungkan akun</div>
                                </div>
                                {isSyncing && <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-blue-500"></div>}
                             </button>
                         </div>
                         <p className="mt-4 text-[10px] text-center text-slate-400 dark:text-slate-600">
                             *Pastikan Google Client ID sudah dikonfigurasi.
                         </p>
                     </div>
                 </div>
             )}

             {/* Note Header (Navbar style) */}
             <div className="border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
                 <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
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
                                className="w-full text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 border-b border-primary-300 focus:outline-none focus:border-primary-600 bg-transparent px-1"
                                placeholder="Judul Catatan"
                             />
                         ) : (
                             <>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 truncate">{note.title}</h2>
                                    {note.syncedTo && (
                                        <span className="text-[10px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-100 dark:border-green-800 flex items-center gap-1">
                                            <CheckIcon /> 
                                            {note.syncedTo === 'google' ? 'Drive' : 'Dropbox'}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span>📅 {new Date(note.createdAt).toLocaleDateString()}</span>
                                    <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                                    <span>{note.sourceFileNames?.length || 0} Sumber</span>
                                </p>
                             </>
                         )}
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
                                    className="px-4 py-1.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-lg shadow-primary-200 dark:shadow-none transition-all"
                                >
                                    Simpan
                                </button>
                             </>
                         ) : (
                             <>
                                <button
                                    onClick={() => setIsCloudModalOpen(true)}
                                    className={`p-2 rounded-lg transition-colors ${note.syncedTo ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                                    title={note.syncedTo ? "Tersinkronisasi" : "Simpan ke Cloud"}
                                >
                                    <CloudIcon />
                                </button>
                                <button 
                                    onClick={() => setIsEditing(true)}
                                    className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                    title="Edit Catatan"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                    </svg>
                                </button>
                                <button 
                                    onClick={() => onDeleteNote(note.id, note.title)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Hapus Catatan"
                                >
                                    <TrashIcon />
                                </button>
                                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex-shrink-0">
                                    <button 
                                        onClick={() => setActiveTab('summary')}
                                        className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all ${activeTab === 'summary' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    >
                                        Ringkasan
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('quiz')}
                                        className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all ${activeTab === 'quiz' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    >
                                        Kuis ({note.quiz?.length || 0})
                                    </button>
                                </div>
                             </>
                         )}
                     </div>
                 </div>
             </div>

             {/* Content Area */}
             <div className="flex-1 overflow-y-auto">
                 <div className="max-w-5xl mx-auto p-4 sm:p-6 md:p-10">
                     {activeTab === 'summary' || isEditing ? (
                         <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 shadow-sm border border-slate-100 dark:border-slate-800">
                             
                             {/* Source Files Section */}
                             {(editedFiles.length > 0 || isEditing || (note.sourceFileNames && note.sourceFileNames.length > 0)) && (
                                 <div className="mb-8 pb-6 border-b border-slate-100 dark:border-slate-800">
                                     <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                                         <div className="flex items-center gap-2">
                                            <span className="w-4 h-4 text-slate-400"><FileIcon /></span>
                                            Sumber Materi
                                         </div>
                                         {isEditing && (
                                             <button 
                                                onClick={() => editFileInputRef.current?.click()}
                                                className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-[10px] font-bold bg-primary-50 dark:bg-primary-900/30 px-2 py-1 rounded border border-primary-100 dark:border-primary-800"
                                             >
                                                + Tambah File
                                             </button>
                                         )}
                                     </h4>
                                     
                                     {/* Hidden input for adding files in edit mode */}
                                     <input 
                                        type="file" 
                                        multiple 
                                        className="hidden" 
                                        ref={editFileInputRef} 
                                        onChange={handleAddFile} 
                                        accept="image/*,application/pdf"
                                     />

                                     <div className="flex flex-wrap gap-3">
                                         {/* Files (Images/PDFs) */}
                                         {(isEditing ? editedFiles : note.originalFiles).map((file, i) => {
                                             const mime = file.match(/:(.*?);/)?.[1] || '';
                                             if(mime.startsWith('image/')) {
                                                 return (
                                                    <div key={`img-${i}`} className="group relative h-16 w-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in hover:shadow-md transition-shadow">
                                                        <img src={file} className="h-full w-full object-cover" />
                                                        {!isEditing && <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>}
                                                        {isEditing && (
                                                            <button 
                                                                onClick={() => handleRemoveFile(i)}
                                                                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                                                            >
                                                                <CloseIcon />
                                                            </button>
                                                        )}
                                                    </div>
                                                 );
                                             }
                                             // For non-images in edit mode preview
                                             return (
                                                 <div key={`file-prev-${i}`} className="relative h-16 w-16 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs text-slate-400 font-bold uppercase overflow-hidden" title={editedSourceNames[i] || 'File'}>
                                                     {mime.includes('pdf') ? 'PDF' : 'DOC'}
                                                     {isEditing && (
                                                            <button 
                                                                onClick={() => handleRemoveFile(i)}
                                                                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                                                            >
                                                                <div className="scale-75"><CloseIcon /></div>
                                                            </button>
                                                     )}
                                                 </div>
                                             );
                                         })}
                                         
                                         {/* When NOT editing, just show names nicely if image preview is not enough */}
                                         {!isEditing && note.sourceFileNames && note.sourceFileNames.map((name, i) => {
                                              return (
                                                 <div key={`file-${i}`} className="flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-primary-200 dark:hover:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors shadow-sm">
                                                     <span className="text-primary-500 dark:text-primary-400">
                                                         {name.endsWith('.pdf') ? '📄' : name.endsWith('ptx') ? '📊' : '📝'}
                                                     </span>
                                                     <span className="truncate max-w-[150px]">{name}</span>
                                                 </div>
                                              )
                                         })}
                                     </div>
                                 </div>
                             )}

                             {/* Main Content Article */}
                             <article className="markdown-body">
                                 {isEditing ? (
                                     <textarea 
                                        value={editedContent}
                                        onChange={(e) => setEditedContent(e.target.value)}
                                        className="w-full h-[60vh] p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 focus:border-primary-300 dark:focus:border-primary-700 outline-none font-mono text-sm leading-relaxed text-slate-800 dark:text-slate-200"
                                        placeholder="Tulis catatanmu di sini (Markdown supported)..."
                                     />
                                 ) : (
                                     <ReactMarkdown 
                                         remarkPlugins={[remarkGfm, remarkMath]} 
                                         rehypePlugins={[rehypeKatex]}
                                         components={{
                                             p: ({children}) => <p className="mb-4 leading-relaxed text-slate-700 dark:text-slate-300 text-base">{children}</p>,
                                             li: ({children}) => <li className="mb-2 text-slate-700 dark:text-slate-300">{children}</li>,
                                             h1: ({children}) => <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-8 mb-4 tracking-tight">{children}</h1>,
                                             h2: ({children}) => <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-8 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">{children}</h2>,
                                             h3: ({children}) => <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-3">{children}</h3>,
                                         }}
                                     >
                                         {note.content}
                                     </ReactMarkdown>
                                 )}
                             </article>
                         </div>
                     ) : (
                         <div className="max-w-3xl mx-auto">
                             {!note.quiz || note.quiz.length === 0 ? (
                                 <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-100 dark:border-slate-800 shadow-sm">
                                     <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                         <BookIcon />
                                     </div>
                                     <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Belum ada kuis</h3>
                                     <p className="mt-2 text-slate-500 dark:text-slate-400">Materi ini belum memiliki kuis otomatis.</p>
                                 </div>
                             ) : (
                                 <div className="space-y-8 pb-20">
                                     {showResults && (
                                         <div className="p-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl text-white text-center shadow-xl shadow-indigo-200 dark:shadow-none mb-8 transform transition-all animate-fade-in relative overflow-hidden">
                                             <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                                             <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
                                             
                                             <p className="text-indigo-100 font-medium mb-1 uppercase tracking-widest text-xs">Hasil Kuis Anda</p>
                                             <div className="text-6xl font-extrabold mb-3 tracking-tighter">{calculateScore()}</div>
                                             <div className="w-full bg-black/20 h-3 rounded-full max-w-xs mx-auto mb-6 overflow-hidden backdrop-blur-sm">
                                                 <div className="bg-white h-full rounded-full transition-all duration-1000 ease-out" style={{width: `${calculateScore()}%`}}></div>
                                             </div>
                                             <p className="text-lg font-medium mb-6">
                                                 {calculateScore() === 100 ? "🎉 Sempurna! Anda luar biasa." : 
                                                  calculateScore() >= 80 ? "✨ Hebat! Pertahankan." :
                                                  calculateScore() >= 60 ? "👍 Cukup baik, pelajari lagi." : "📚 Jangan menyerah, coba baca ringkasan lagi!"}
                                             </p>
                                             
                                             <button
                                                onClick={handleRegenerateQuiz}
                                                disabled={isRegenerating}
                                                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95"
                                             >
                                                {isRegenerating ? (
                                                    <>
                                                        <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
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
                                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 flex flex-col items-center justify-center space-y-4 shadow-sm border border-slate-100 dark:border-slate-800">
                                            <div className="loading-wave">
                                                <div className="loading-bar"></div>
                                                <div className="loading-bar"></div>
                                                <div className="loading-bar"></div>
                                                <div className="loading-bar"></div>
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400 font-medium">Sedang menyusun soal baru untukmu...</p>
                                        </div>
                                     ) : (
                                        <div className="space-y-6">
                                            {note.quiz.map((q, idx) => {
                                                const userAnswer = quizAnswers[idx];
                                                const isCorrect = userAnswer === q.answer;
                                                
                                                return (
                                                    <div key={idx} className={`rounded-2xl p-6 border transition-all duration-300 ${showResults ? (isCorrect ? 'bg-green-50/50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-800') : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary-300 dark:hover:border-primary-700 shadow-sm hover:shadow-md'}`}>
                                                        <div className="flex gap-4 mb-4 justify-between items-start">
                                                            <div className="flex gap-4">
                                                                <span className={`flex-shrink-0 w-8 h-8 rounded-xl font-bold flex items-center justify-center text-sm shadow-sm ${showResults ? (isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                                                                    {idx + 1}
                                                                </span>
                                                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 pt-0.5 leading-relaxed">{q.question}</h3>
                                                            </div>
                                                            {userAnswer !== undefined && (
                                                                <button 
                                                                    onClick={() => handleResetQuestion(idx)}
                                                                    className="text-slate-400 hover:text-primary-600 transition-colors p-1"
                                                                    title="Ulangi soal ini"
                                                                >
                                                                    <ReloadIcon />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="space-y-3 ml-12">
                                                            {q.options.map((option, optIdx) => {
                                                                let btnClass = "w-full text-left px-5 py-3.5 rounded-xl border text-base transition-all font-medium relative overflow-hidden ";
                                                                
                                                                if (showResults) {
                                                                    if (option === q.answer) btnClass += "bg-green-100 dark:bg-green-900/40 border-green-500 dark:border-green-600 text-green-900 dark:text-green-100 shadow-sm";
                                                                    else if (userAnswer === option && option !== q.answer) btnClass += "bg-red-100 dark:bg-red-900/40 border-red-400 dark:border-red-600 text-red-900 dark:text-red-100";
                                                                    else btnClass += "bg-white dark:bg-slate-900 border-transparent text-slate-400 opacity-60";
                                                                } else {
                                                                    if (userAnswer === option) btnClass += "bg-primary-50 dark:bg-primary-900/30 border-primary-500 dark:border-primary-500 text-primary-900 dark:text-primary-100 shadow-sm ring-1 ring-primary-500";
                                                                    else btnClass += "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300";
                                                                }
    
                                                                return (
                                                                    <button 
                                                                        key={optIdx}
                                                                        onClick={() => handleAnswer(idx, option)}
                                                                        disabled={showResults && userAnswer !== undefined}
                                                                        className={btnClass}
                                                                    >
                                                                        <div className="flex justify-between items-center relative z-10">
                                                                            <span>{option}</span>
                                                                            {showResults && option === q.answer && <CheckIcon />}
                                                                        </div>
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                        {showResults && (
                                                            <div className="ml-12 mt-4 p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm shadow-sm">
                                                                <strong className="text-slate-900 dark:text-white block mb-1 flex items-center gap-2">
                                                                    <span className="text-lg">💡</span> Pembahasan:
                                                                </strong>
                                                                <div className="leading-relaxed pl-7">{q.explanation}</div>
                                                            </div>
                                                        )}
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
                                                     disabled={Object.keys(quizAnswers).length < note.quiz.length}
                                                     className="px-8 py-3 bg-primary-600 text-white font-bold rounded-full shadow-lg shadow-primary-200 dark:shadow-none hover:bg-primary-700 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-1 hover:scale-105"
                                                 >
                                                     Cek Hasil ({Object.keys(quizAnswers).length}/{note.quiz.length})
                                                 </button>
                                             ) : (
                                                 <button 
                                                     onClick={() => {
                                                         setShowResults(false);
                                                         setQuizAnswers({});
                                                         window.scrollTo({top: 0, behavior: 'smooth'});
                                                     }}
                                                     className="px-8 py-3 bg-slate-800 dark:bg-slate-700 text-white font-bold rounded-full shadow-lg hover:bg-slate-900 dark:hover:bg-slate-600 transition-all transform hover:-translate-y-1 hover:scale-105"
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