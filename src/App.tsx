  toolName: string;
  input: string;
  output: string;
  timestamp: number;
}

export interface ResumeData {
  personal: {
    name: string;
    title: string;
    email: string;
    phone: string;
    address: string;
    summary: string;
    linkedin: string;
    github: string;
    website: string;
  };
  experience: { company: string; role: string; dates: string; description: string; }[];
  education: { degree: string; institute: string; year: string; }[];
  projects: { name: string; description: string; link: string; }[];
  certifications: string;
  skills: { skills: string; languages: string; };
}

export type CVTemplate = 'modern' | 'classic' | 'minimal';

// Main App Component
export default function App() {
  const [selectedToolId, setSelectedToolId] = useState<ToolId | null>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('ai_suite_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('ai_suite_theme');
    if (saved) return saved === 'dark';
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('ai_suite_lang');
    return (saved as Language) || 'en';
  });

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = translations[language];

  const [resumeStep, setResumeStep] = useState(1);
  const [cvTemplate, setCvTemplate] = useState<CVTemplate>('modern');
  const [resumeData, setResumeData] = useState<ResumeData>(() => {
    const saved = localStorage.getItem('ai_suite_resume');
    return saved ? JSON.parse(saved) : {
      personal: { name: '', title: '', email: '', phone: '', address: '', summary: '', linkedin: '', github: '', website: '' },
      experience: [{ company: '', role: '', dates: '', description: '' }],
      education: [{ degree: '', institute: '', year: '' }],
      projects: [{ name: '', description: '', link: '' }],
      certifications: '',
      skills: { skills: '', languages: '' },
    };
  });

  const [showPreview, setShowPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'history' | 'profile'>('home');
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const resumeRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedTool = TOOLS.find(t => t.id === selectedToolId);

  // Connection, Theme, Language & Auth effects (আপনার ফাইলে যেমন ছিল তেমন রাখা হয়েছে)
  React.useEffect(() => {
    async function testConnection() {
      try { await getDocFromServer(doc(db, 'test', 'connection')); } catch (err) {}
    }
    testConnection();
  }, []);

  React.useEffect(() => {
    if (isDarkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('ai_suite_theme', 'dark'); } 
    else { document.documentElement.classList.remove('dark'); localStorage.setItem('ai_suite_theme', 'light'); }
  }, [isDarkMode]);

  React.useEffect(() => { localStorage.setItem('ai_suite_lang', language); }, [language]);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        let userDoc;
        try { userDoc = await getDoc(userDocRef); } catch (err) { handleFirestoreError(err, OperationType.GET, 'users/' + firebaseUser.uid); return; }
        
        const today = new Date().toISOString().split('T')[0];
        
        if (!userDoc.exists()) {
          const newUserData: UserData = { uid: firebaseUser.uid, email: firebaseUser.email || '', credits: 5, lastResetDate: today, isPremium: false };
          try { await setDoc(userDocRef, newUserData); } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'users/' + firebaseUser.uid); }
          setUserData(newUserData);
        } else {
          const data = userDoc.data() as UserData;
          if (data.lastResetDate !== today && !data.isPremium) {
            try { await updateDoc(userDocRef, { credits: 5, lastResetDate: today }); } catch (err) { handleFirestoreError(err, OperationType.UPDATE, 'users/' + firebaseUser.uid); }
            setUserData({ ...data, credits: 5, lastResetDate: today });
          } else { setUserData(data); }
        }

        const unsubDoc = onSnapshot(userDocRef, (doc) => { if (doc.exists()) setUserData(doc.data() as UserData); });
        return () => unsubDoc();
      } else { setUserData(null); }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => { localStorage.setItem('ai_suite_history', JSON.stringify(history)); }, [history]);
  React.useEffect(() => { localStorage.setItem('ai_suite_resume', JSON.stringify(resumeData)); }, [resumeData]);

  // Handlers
  const handleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (err) {} };
  const handleLogout = async () => { try { await signOut(auth); } catch (err) {} };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPDF = async () => {
    if (!resumeRef.current) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const element = resumeRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${resumeData.personal.name || 'Resume'}_CV.pdf`);
    } catch (error) { setDownloadError(t.pdfError); } finally { setIsDownloading(false); }
  };

  const handleWatchAd = async () => {
    if (!user) return;
    setIsWatchingAd(true);
    setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'users', user.uid), { credits: increment(5) });
        setShowAdPopup(false);
      } catch (err) {} finally { setIsWatchingAd(false); }
    }, 5000);
  };

  const handleGenerate = async () => {
    if (!selectedTool || isLoading) return;
    if (!user) { setError(t.loginRequired); setTimeout(() => setError(null), 5000); return; }
    if (userData && userData.credits <= 0 && !userData.isPremium) { setShowAdPopup(true); return; }

    let finalPrompt = `LANGUAGE: ${language === 'en' ? 'English' : 'Bengali'}\n\n${input}`;
    if (selectedToolId === 'resume') {
      finalPrompt = `LANGUAGE: ${language === 'en' ? 'English' : 'Bengali'}\nResume Data: ${JSON.stringify(resumeData)}`;
    }

    setIsLoading(true);
    setOutput('');
    try {
      const result = await generateContent(selectedTool.systemInstruction, finalPrompt);
      setOutput(result);
      setHistory(prev => [{ id: Date.now().toString(), toolId: selectedTool.id, toolName: language === 'bn' ? t[selectedTool.id as keyof typeof t] as string : selectedTool.name, input: input.substring(0, 100), output: result, timestamp: Date.now() }, ...prev]);
      if (userData && !userData.isPremium) { await updateDoc(doc(db, 'users', user.uid), { credits: increment(-1) }); }
    } catch (error) { setOutput(t.error); } finally { setIsLoading(false); }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    if (!user) { setError(t.loginRequired); return; }
    if (userData && userData.credits <= 0 && !userData.isPremium) { setShowAdPopup(true); return; }

    setChatMessages(prev => [...prev, { role: 'user', text: chatInput }]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const result = await generateContent("You are a helpful assistant", chatInput);
      setChatMessages(prev => [...prev, { role: 'ai', text: result }]);
      if (userData && !userData.isPremium) { await updateDoc(doc(db, 'users', user.uid), { credits: increment(-1) }); }
    } catch (error) { setError(t.error); } finally { setIsChatLoading(false); }
  };

  // UI Components
  const AIChat = () => (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
      <div className="p-4 border-b dark:border-slate-800 flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-blue-600" />
        <h2 className="font-bold text-slate-900 dark:text-white">{t.aiChat}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 dark:text-white'}`}>
              <Markdown>{msg.text}</Markdown>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 border-t dark:border-slate-800">
        <div className="flex gap-2">
          <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleChatSend()} placeholder={t.chatPlaceholder} className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl focus:outline-none dark:text-white" />
          <button onClick={handleChatSend} className="p-3 bg-blue-600 text-white rounded-xl">{isChatLoading ? <Loader2 className="animate-spin" /> : <Send />}</button>
        </div>
      </div>
    </div>
  );

  const ProfileView = () => (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      {user && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 text-center space-y-4">
          <img src={user.photoURL || ''} alt="" className="w-24 h-24 rounded-full mx-auto" />
          <h2 className="text-xl font-bold dark:text-white">{user.displayName}</h2>
          <p className="text-slate-500">{user.email}</p>
          <div className="flex justify-center gap-2">
            <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 text-xs font-bold rounded-full">{userData?.credits} {t.credits}</span>
            {userData?.isPremium && <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-600 text-xs font-bold rounded-full">Premium</span>}
          </div>
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border dark:border-slate-800 overflow-hidden">
        <button onClick={() => setIsDarkMode(!isDarkMode)} className="w-full p-4 flex justify-between dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800">
          <span className="font-medium">{isDarkMode ? t.lightMode : t.darkMode}</span>
          {isDarkMode ? <Sun /> : <Moon />}
        </button>
        <button onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')} className="w-full p-4 flex justify-between dark:text-white border-t dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
          <span className="font-medium">{t.language}: {language === 'en' ? 'English' : 'বাংলা'}</span>
          <Languages />
        </button>
      </div>
      <button onClick={handleLogout} className="w-full p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2">
        <LogOut /> {t.logout}
      </button>
    </div>
  );

  const BottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
      <div className="max-w-lg mx-auto bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border dark:border-white/10 rounded-3xl shadow-2xl flex items-center justify-around p-2">
        {[
          { id: 'home', icon: <LayoutDashboard />, label: t.home },
          { id: 'chat', icon: <MessageSquare />, label: t.aiChat },
          { id: 'profile', icon: <User />, label: t.profile },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center p-2 rounded-2xl ${activeTab === tab.id ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400'}`}>
            {tab.icon} <span className="text-[10px] font-bold">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );

  // Return JSX
  return (
    <ErrorBoundary>
      <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
        <main className="max-w-5xl mx-auto px-4 pt-8 pb-32">
          {error && <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-xl">{error}</div>}

          <AnimatePresence mode="wait">
            {activeTab === 'chat' ? (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><AIChat /></motion.div>
            ) : activeTab === 'profile' ? (
              <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><ProfileView /></motion.div>
            ) : selectedToolId ? (
              <motion.div key="tool" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Input & Output UI for selected tool */}
                <button onClick={() => setSelectedToolId(null)} className="mb-4 flex items-center gap-1 text-slate-600 dark:text-slate-400"><ChevronLeft /> Back</button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.chatPlaceholder} className="w-full h-56 p-4 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl dark:text-white" />
                    <button onClick={handleGenerate} className="w-full py-3 bg-blue-600 text-white rounded-xl flex items-center justify-center gap-2">{isLoading ? <Loader2 className="animate-spin" /> : <Send />} {t.generating}</button>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border dark:border-slate-800 dark:text-white">
                    <div className="flex justify-between items-center mb-2"><span>{t.result}</span><button onClick={handleCopy} className="text-sm flex items-center gap-1">{copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />} Copy</button></div>
                    <div className="prose dark:prose-invert"><Markdown>{output}</Markdown></div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="col-span-full mb-4">
                  <h2 className="text-3xl font-extrabold dark:text-white">{t.heroTitle}</h2>
                  <p className="text-slate-600 dark:text-slate-400">{t.heroSubtitle}</p>
                </div>
                {TOOLS.map((tool) => (
                  <button key={tool.id} onClick={() => setSelectedToolId(tool.id)} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border dark:border-slate-800 text-left hover:shadow-lg transition-all">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center mb-4"><Sparkles /></div>
                    <h3 className="font-bold dark:text-white">{language === 'bn' ? t[tool.id as keyof typeof t] as string : tool.name}</h3>
                    <p className="text-sm text-slate-500">{language === 'bn' ? t[`${tool.id}Desc` as keyof typeof t] as string : tool.description}</p>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        
        <BottomNav />

        {/* Ad Popup UI */}
        <AnimatePresence>
          {showAdPopup && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto text-amber-600"><Star className="w-10 h-10" /></div>
                <div><h3 className="text-2xl font-black dark:text-white">{t.watchAd}</h3><p className="text-slate-500 font-medium">{t.adPrompt}</p></div>
                <button onClick={handleWatchAd} disabled={isWatchingAd} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold">{isWatchingAd ? <Loader2 className="animate-spin mx-auto" /> : t.watchNow}</button>
                <button onClick={() => setShowAdPopup(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">Maybe Later</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
