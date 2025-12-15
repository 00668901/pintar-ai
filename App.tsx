import React, { useState, useEffect } from 'react';
import { Landing } from './pages/Landing';
import { ChatApp } from './pages/ChatApp';
import { User } from './types';
import { initGoogleAuth } from './services/authService';

const App: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<User | null>(null);

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

  // Initialize Google Auth
  useEffect(() => {
    initGoogleAuth((loggedInUser) => {
        setUser(loggedInUser);
        setHasStarted(true); // Auto enter if logged in from landing
    });
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
      setUser(null);
      // @ts-ignore
      if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
      setHasStarted(false);
  };

  // Simple state-based routing
  if (!hasStarted && !user) {
    return (
      <Landing 
        onStart={() => setHasStarted(true)} 
        onSignIn={(u) => { setUser(u); setHasStarted(true); }}
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