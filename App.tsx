import React, { useState, useEffect } from 'react';
import { Landing } from './pages/Landing';
import { ChatApp } from './pages/ChatApp';
import { User } from './types';

const App: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Always null for Guest Mode
  const user: User | null = null;

  // Initialize Theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  };

  const handleSignOut = () => {
      setHasStarted(false);
  };

  if (!hasStarted) {
    return (
      <Landing 
        onStart={() => setHasStarted(true)} 
        onSignIn={() => setHasStarted(true)}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  return (
    <ChatApp 
      user={user} 
      onSignOut={handleSignOut}
      theme={theme}
      toggleTheme={toggleTheme}
    />
  );
};

export default App;