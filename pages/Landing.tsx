import React from 'react';
import { SparklesIcon, SunIcon, MoonIcon } from '../components/Icons';
import { User } from '../types';

interface LandingProps {
  onStart: () => void;
  onSignIn: (user: User) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onStart, theme, toggleTheme }) => {
  
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col transition-colors duration-300">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-6 md:px-12 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 text-primary-600 dark:text-primary-500 font-bold text-2xl">
          <SparklesIcon />
          <span>PintarAI</span>
        </div>
        <div className="flex items-center gap-4">
            <button 
                onClick={toggleTheme}
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
                {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto pb-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-sm font-semibold mb-8 border border-indigo-100 dark:border-indigo-900">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
          AI Belajar #1 di Indonesia
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight mb-6">
          Belajar jadi lebih mudah <br />
          dengan <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600 dark:from-primary-400 dark:to-indigo-400">Asisten Pintar</span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 mb-10 max-w-2xl leading-relaxed">
          Tanya soal matematika, buat ringkasan materi, atau minta bantuan menulis esai. PintarAI siap membantu tugas sekolahmu kapan saja, 24/7.
        </p>

        <div className="flex flex-col items-center gap-4">
            <button 
            onClick={onStart}
            className="group relative inline-flex items-center justify-center px-8 py-4 font-semibold text-white transition-all duration-200 bg-primary-600 rounded-full hover:bg-primary-700 hover:scale-105 focus:outline-none ring-offset-2 focus:ring-2 shadow-xl shadow-primary-200 dark:shadow-none"
            >
            Mulai Belajar Sekarang
            <svg className="w-5 h-5 ml-2 -mr-1 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
            </button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-20 text-left">
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-primary-200 dark:hover:border-primary-800 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-4 text-xl">📐</div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">Bedah Soal</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Foto soal matematika atau sains kamu, AI akan menjelaskan cara menjawabnya langkah demi langkah.</p>
          </div>
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-primary-200 dark:hover:border-primary-800 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 text-xl">📝</div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">Bantu Tulis</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Bingung mulai dari mana saat menulis esai? Dapatkan kerangka tulisan dan saran ide menarik.</p>
          </div>
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-primary-200 dark:hover:border-primary-800 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4 text-xl">⚡</div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">Tanya Apa Saja</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Seperti punya guru privat pribadi yang sabar dan selalu siap menjawab semua pertanyaanmu.</p>
          </div>
        </div>
      </main>
      
      <footer className="py-8 text-center text-slate-400 dark:text-slate-600 text-sm border-t border-slate-100 dark:border-slate-900">
        &copy; 2024 PintarAI. Dibuat dengan Gemini API.
      </footer>
    </div>
  );
};