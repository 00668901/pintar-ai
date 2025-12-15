import React from 'react';
import { LearningMode, ChatSession, AppView, User } from '../types';
import { SparklesIcon, CloseIcon, ChatIcon, BookIcon, HistoryIcon, TrashIcon, SunIcon, MoonIcon, GoogleIcon } from './Icons';
import { renderGoogleButton } from '../services/authService';

interface SidebarProps {
  currentMode: LearningMode;
  setMode: (mode: LearningMode) => void;
  isOpen: boolean;
  onClose: () => void;
  clearChat: () => void;
  currentView: AppView;
  setView: (view: AppView) => void;
  sessions: ChatSession[];
  loadSession: (session: ChatSession) => void;
  currentSessionId: string | null;
  deleteSession: (id: string) => void;
  user: User | null;
  onSignOut: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentMode, 
  setMode, 
  isOpen, 
  onClose, 
  clearChat,
  currentView,
  setView,
  sessions,
  loadSession,
  currentSessionId,
  deleteSession,
  user,
  onSignOut,
  theme,
  toggleTheme
}) => {
  const modes = Object.values(LearningMode);

  // Render Google button if user is not logged in and sidebar is open
  React.useEffect(() => {
    if (isOpen && !user) {
        // Short delay to ensure DOM is ready
        setTimeout(() => renderGoogleButton("sidebar-google-btn"), 100);
    }
  }, [isOpen, user]);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div className={`fixed top-0 left-0 bottom-0 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-40 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
             <div className="flex items-center gap-2 text-primary-600 dark:text-primary-500 font-bold text-xl">
               <SparklesIcon />
               <span>PintarAI</span>
             </div>
             <button onClick={onClose} className="md:hidden text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
               <CloseIcon />
             </button>
          </div>

          {/* User Profile Section */}
          <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800">
              {user ? (
                  <div className="flex items-center gap-3">
                      <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700" />
                      <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                      </div>
                      <button onClick={onSignOut} className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 font-medium">
                          Keluar
                      </button>
                  </div>
              ) : (
                  <div className="flex flex-col gap-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-1">Masuk untuk simpan progress</p>
                      <div id="sidebar-google-btn" className="flex justify-center"></div>
                  </div>
              )}
          </div>

          {/* Main Navigation Tabs */}
          <div className="flex p-2 gap-1 m-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button 
                onClick={() => setView('chat')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${currentView === 'chat' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
                <ChatIcon /> Chat
            </button>
            <button 
                onClick={() => setView('notes')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${currentView === 'notes' ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
                <BookIcon /> Catatan
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {currentView === 'chat' ? (
                <>
                    {/* New Session Button */}
                    <button 
                      onClick={() => {
                        clearChat();
                        if (window.innerWidth < 768) onClose();
                      }}
                      className="w-full mb-6 flex items-center justify-center gap-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white py-3 rounded-xl transition-colors shadow-lg shadow-slate-200 dark:shadow-none"
                    >
                      <span>+ Sesi Baru</span>
                    </button>

                    {/* Mode Selection */}
                    <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-2">Mode AI</h3>
                    <div className="space-y-1 mb-6">
                      {modes.map((mode) => (
                        <button
                          key={mode}
                          onClick={() => {
                            setMode(mode);
                            if (window.innerWidth < 768) onClose();
                          }}
                          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            currentMode === mode 
                              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border border-primary-100 dark:border-primary-800' 
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {mode === LearningMode.GENERAL && "🤖 Tanya Umum"}
                          {mode === LearningMode.MATH && "📐 Bedah Soal"}
                          {mode === LearningMode.WRITING && "📝 Bantu Tulis"}
                          {mode === LearningMode.SUMMARIZER && "📚 Ringkas Materi"}
                        </button>
                      ))}
                    </div>

                    {/* History List */}
                    {sessions.length > 0 && (
                        <>
                            <h3 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
                                <HistoryIcon /> Riwayat
                            </h3>
                            <div className="space-y-1">
                                {sessions.slice().sort((a,b) => b.lastModified - a.lastModified).map(session => (
                                    <div key={session.id} className="group flex items-center justify-between w-full px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                                        <div 
                                            className="truncate flex-1"
                                            onClick={() => {
                                                loadSession(session);
                                                if (window.innerWidth < 768) onClose();
                                            }}
                                        >
                                            <span className={currentSessionId === session.id ? "font-semibold text-primary-700 dark:text-primary-400" : ""}>
                                                {session.title || "Percakapan Baru"}
                                            </span>
                                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                                {new Date(session.lastModified).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteSession(session.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </>
            ) : (
                <div className="text-center mt-10 text-slate-400 dark:text-slate-500 px-4">
                    <BookIcon />
                    <p className="mt-2 text-sm">Mode Catatan</p>
                    <p className="text-xs mt-1">Unggah materi pelajaran, AI akan merangkum dan menyimpannya di sini.</p>
                </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button 
                onClick={toggleTheme}
                className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
                {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                <span>{theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};