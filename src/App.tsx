
import React, { useState, useRef } from 'react';
import { 
  Share2, 
  Youtube, 
  CheckCircle, 
  FileText, 
  Mail, 
  ChevronLeft, 
  Send, 
  Loader2,
  Copy,
  Check,
  Sparkles,
  Briefcase,
  BookOpen,
  Utensils,
  MessageSquare,
  Dumbbell,
  FileUser,
  Plus,
  Trash2,
  Download,
  History,
  Save,
  ChevronRight,
  Eye,
  Layout,
  Moon,
  Sun,
  Languages,
  LogOut,
  LogIn,
  User,
  CreditCard,
  Code,
  LayoutDashboard,
  Info,
  ShieldCheck,
  Star,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { TOOLS, Tool, ToolId } from './types';
import { generateContent } from './services/gemini';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { ResumePreview } from './components/ResumePreview';
import { translations, Language } from './i18n';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
  FirebaseUser,
  UserData,
  OperationType,
  handleFirestoreError,
  getDocFromServer
} from './firebase';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error) {
          errorMessage = `Firestore Error: ${parsedError.error} during ${parsedError.operationType} on ${parsedError.path}`;
        }
      } catch (e) {
        errorMessage = this.state.error.message || String(this.state.error);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 text-center border border-slate-200 dark:border-slate-800">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Application Error</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-8 break-words">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Share2: <Share2 className="w-5 h-5" />,
  Youtube: <Youtube className="w-5 h-5" />,
  CheckCircle: <CheckCircle className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  Mail: <Mail className="w-5 h-5" />,
  Briefcase: <Briefcase className="w-5 h-5" />,
  BookOpen: <BookOpen className="w-5 h-5" />,
  Utensils: <Utensils className="w-5 h-5" />,
  MessageSquare: <MessageSquare className="w-5 h-5" />,
  Dumbbell: <Dumbbell className="w-5 h-5" />,
  FileUser: <FileUser className="w-5 h-5" />,
};

interface HistoryItem {
  id: string;
  toolId: ToolId;
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
  experience: {
    company: string;
    role: string;
    dates: string;
    description: string;
  }[];
  education: {
    degree: string;
    institute: string;
    year: string;
  }[];
  projects: {
    name: string;
    description: string;
    link: string;
  }[];
  certifications: string;
  skills: {
    skills: string;
    languages: string;
  };
}

export type CVTemplate = 'modern' | 'classic' | 'minimal';

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

  // Connection test
  React.useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  // Firebase State
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
      personal: {
        name: '',
        title: '',
        email: '',
        phone: '',
        address: '',
        summary: '',
        linkedin: '',
        github: '',
        website: '',
      },
      experience: [{ company: '', role: '', dates: '', description: '' }],
      education: [{ degree: '', institute: '', year: '' }],
      projects: [{ name: '', description: '', link: '' }],
      certifications: '',
      skills: {
        skills: '',
        languages: '',
      },
    };
  });

  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CVTemplate>('modern');
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

  // Theme effect
  React.useEffect(() => {
    console.log('Theme changed:', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ai_suite_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ai_suite_theme', 'light');
    }
    console.log('HTML classes:', document.documentElement.className);
  }, [isDarkMode]);

  // Language effect
  React.useEffect(() => {
    localStorage.setItem('ai_suite_lang', language);
  }, [language]);

  // Firebase Auth effect
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Check/Create user document
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        let userDoc;
        try {
          userDoc = await getDoc(userDocRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, 'users/' + firebaseUser.uid);
          return;
        }
        
        const today = new Date().toISOString().split('T')[0];
        
        if (!userDoc.exists()) {
          const newUserData: UserData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            credits: 5,
            lastResetDate: today,
            isPremium: false
          };
          try {
            await setDoc(userDocRef, newUserData);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, 'users/' + firebaseUser.uid);
          }
          setUserData(newUserData);
        } else {
          const data = userDoc.data() as UserData;
          // Daily reset check
          if (data.lastResetDate !== today && !data.isPremium) {
            try {
              await updateDoc(userDocRef, {
                credits: 5,
                lastResetDate: today
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, 'users/' + firebaseUser.uid);
            }
            setUserData({ ...data, credits: 5, lastResetDate: today });
          } else {
            setUserData(data);
          }
        }

        // Real-time listener for credits
        const unsubDoc = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            setUserData(doc.data() as UserData);
          }
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, 'users/' + firebaseUser.uid);
        });
        return () => unsubDoc();
      } else {
        setUserData(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    localStorage.setItem('ai_suite_history', JSON.stringify(history));
  }, [history]);

  React.useEffect(() => {
    localStorage.setItem('ai_suite_resume', JSON.stringify(resumeData));
  }, [resumeData]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const selectedTool = TOOLS.find(t => t.id === selectedToolId);

  const handleDownloadPDF = async () => {
    if (!resumeRef.current) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const element = resumeRef.current;
      
      // Ensure all images are loaded before capturing
      const images = element.getElementsByTagName('img');
      await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
      }));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        onclone: (clonedDoc) => {
          // Force all elements in the clone to avoid oklch if possible
          const allElements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i] as HTMLElement;
            if (el.style) {
              // Simple cleanup if needed
            }
          }
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${resumeData.personal.name || 'Resume'}_AI_CV.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
      setDownloadError(t.pdfError);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleWatchAd = async () => {
    if (!user) return;
    setIsWatchingAd(true);
    // Simulate ad watching for 5 seconds
    setTimeout(async () => {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          credits: increment(5)
        });
        setShowAdPopup(false);
        setIsWatchingAd(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'users/' + user.uid);
        setIsWatchingAd(false);
      }
    }, 5000);
  };

  const handleGenerate = async () => {
    if (!selectedTool || isLoading) return;
    
    if (!user) {
      setError(t.loginRequired);
      setTimeout(() => setError(null), 5000);
      return;
    }

    if (userData && userData.credits <= 0 && !userData.isPremium) {
      setShowAdPopup(true);
      return;
    }

    let finalPrompt = `LANGUAGE: ${language === 'en' ? 'English' : 'Bengali'}\n\n${input}`;

    if (selectedToolId === 'resume') {
      finalPrompt = `
LANGUAGE: ${language === 'en' ? 'English' : 'Bengali'}
TEMPLATE STYLE: ${cvTemplate.toUpperCase()}

PERSONAL INFORMATION:
Name: ${resumeData.personal.name}
Target Job Title: ${resumeData.personal.title}
Email: ${resumeData.personal.email}
Phone: ${resumeData.personal.phone}
Address: ${resumeData.personal.address}
Summary/Objective: ${resumeData.personal.summary}
Social Links: LinkedIn: ${resumeData.personal.linkedin}, GitHub: ${resumeData.personal.github}, Website: ${resumeData.personal.website}

PROFESSIONAL EXPERIENCE:
${resumeData.experience.map((exp, i) => `
Experience ${i + 1}:
Company: ${exp.company}
Role: ${exp.role}
Dates: ${exp.dates}
Description: ${exp.description}
`).join('\n')}

EDUCATION:
${resumeData.education.map((edu, i) => `
Education ${i + 1}:
Degree: ${edu.degree}
Institute: ${edu.institute}
Year: ${edu.year}
`).join('\n')}

PROJECTS:
${resumeData.projects.map((proj, i) => `
Project ${i + 1}:
Name: ${proj.name}
Description: ${proj.description}
Link: ${proj.link}
`).join('\n')}

CERTIFICATIONS:
${resumeData.certifications}

SKILLS & LANGUAGES:
Skills: ${resumeData.skills.skills}
Languages: ${resumeData.skills.languages}
      `;
    }

    if (!finalPrompt.trim()) return;

    setIsLoading(true);
    setOutput('');
    try {
      const result = await generateContent(selectedTool.systemInstruction, finalPrompt);
      setOutput(result);
      
      // Add to history
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        toolId: selectedTool.id,
        toolName: language === 'bn' ? t[selectedTool.id as keyof typeof t] as string : selectedTool.name,
        input: finalPrompt.substring(0, 100) + '...',
        output: result,
        timestamp: Date.now(),
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 20));

      // Deduct credit
      if (userData && !userData.isPremium) {
        const userDocRef = doc(db, 'users', user.uid);
        try {
          await updateDoc(userDocRef, {
            credits: increment(-1)
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'users/' + user.uid);
        }
      }
    } catch (error) {
      console.error('Generation failed:', error);
      setOutput(t.error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    
    if (!user) {
      setError(t.loginRequired);
      return;
    }

    if (userData && userData.credits <= 0 && !userData.isPremium) {
      setShowAdPopup(true);
      return;
    }

    const newMessage = { role: 'user' as const, text: chatInput };
    setChatMessages(prev => [...prev, newMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const result = await generateContent("You are a helpful AI assistant. Answer the user's questions clearly and concisely.", chatInput);
      setChatMessages(prev => [...prev, { role: 'ai', text: result }]);
      
      if (userData && !userData.isPremium) {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { credits: increment(-1) });
      }
    } catch (error) {
      console.error('Chat failed:', error);
      setError(t.error);
    } finally {
      setIsChatLoading(false);
    }
  };

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const AIChat = () => (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white">{t.aiChat}</h2>
          <p className="text-xs text-slate-500">{t.poweredBy}</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <Sparkles className="w-12 h-12 text-blue-600" />
            <p className="text-slate-500 font-medium">{t.chatWelcome}</p>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-none'
            }`}>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown>{msg.text}</Markdown>
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleChatSend()}
            placeholder={t.chatPlaceholder}
            className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white outline-none"
          />
          <button
            onClick={handleChatSend}
            disabled={isChatLoading}
            className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isChatLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>
  );

  const ProfileView = () => (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      {user && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-4">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-blue-500 mx-auto shadow-lg">
            <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.displayName}</h2>
            <p className="text-slate-500 text-sm">{user.email}</p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-2xl border border-blue-100 dark:border-blue-800">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{userData?.credits} {t.credits}</span>
            </div>
            {userData?.isPremium && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 rounded-2xl border border-amber-100 dark:border-amber-800">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Premium</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">{t.settings}</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </div>
              <span className="font-medium text-slate-700 dark:text-slate-300">{isDarkMode ? t.lightMode : t.darkMode}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
          
          <button onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                <Languages className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-700 dark:text-slate-300">{t.language}: {language === 'en' ? 'English' : 'বাংলা'}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">{t.watchAd}</h3>
        </div>
        <button onClick={() => setShowAdPopup(true)} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
              <Star className="w-5 h-5" />
            </div>
            <span className="font-medium text-slate-700 dark:text-slate-300">{t.watchAd}</span>
          </div>
          <span className="text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">+5 Credits</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">Legal & Info</h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {[
            { icon: <Info className="w-5 h-5" />, label: t.aboutUs, color: 'bg-indigo-100 text-indigo-600', action: () => window.open('https://example.com/about', '_blank') },
            { icon: <ShieldCheck className="w-5 h-5" />, label: t.privacyPolicy, color: 'bg-green-100 text-green-600', action: () => window.open('https://example.com/privacy', '_blank') },
            { icon: <FileText className="w-5 h-5" />, label: t.termsConditions, color: 'bg-orange-100 text-orange-600', action: () => window.open('https://example.com/terms', '_blank') },
            { icon: <Share2 className="w-5 h-5" />, label: t.shareApp, color: 'bg-pink-100 text-pink-600', action: () => { if(navigator.share) navigator.share({ title: 'All-in-One AI Tools', url: window.location.href }) } },
            { icon: <Star className="w-5 h-5" />, label: t.rateApp, color: 'bg-yellow-100 text-yellow-600', action: () => window.open('https://play.google.com/store/apps/details?id=com.example.app', '_blank') },
            { icon: <Code className="w-5 h-5" />, label: t.developerInfo, color: 'bg-slate-100 text-slate-600', action: () => window.open('https://github.com/example', '_blank') },
          ].map((item, i) => (
            <button key={i} onClick={item.action} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${item.color} dark:bg-opacity-20`}>
                  {item.icon}
                </div>
                <span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleLogout} className="w-full p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
        <LogOut className="w-5 h-5" />
        {t.logout}
      </button>
    </div>
  );

  const BottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
      <div className="max-w-lg mx-auto bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-white/10 rounded-3xl shadow-2xl flex items-center justify-around p-2">
        {[
          { id: 'home', icon: <LayoutDashboard className="w-6 h-6" />, label: t.home },
          { id: 'chat', icon: <MessageSquare className="w-6 h-6" />, label: t.aiChat },
          { id: 'history', icon: <History className="w-6 h-6" />, label: t.history },
          { id: 'profile', icon: <User className="w-6 h-6" />, label: t.profile },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setSelectedToolId(null);
              setShowHistory(false);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all relative ${
              activeTab === tab.id 
                ? 'text-blue-600' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-blue-50 dark:bg-blue-900/30 rounded-2xl -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            {tab.icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );

  const reset = () => {
    setSelectedToolId(null);
    setInput('');
    setOutput('');
    setResumeStep(1);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('ai_suite_history');
  };

  const addExperience = () => {
    setResumeData(prev => ({
      ...prev,
      experience: [...prev.experience, { company: '', role: '', dates: '', description: '' }]
    }));
  };

  const removeExperience = (index: number) => {
    setResumeData(prev => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index)
    }));
  };

  const addEducation = () => {
    setResumeData(prev => ({
      ...prev,
      education: [...prev.education, { degree: '', institute: '', year: '' }]
    }));
  };

  const removeEducation = (index: number) => {
    setResumeData(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index)
    }));
  };

  const addProject = () => {
    setResumeData(prev => ({
      ...prev,
      projects: [...prev.projects, { name: '', description: '', link: '' }]
    }));
  };

  const removeProject = (index: number) => {
    setResumeData(prev => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index)
    }));
  };

  const AdPopup = () => (
    <AnimatePresence>
      {showAdPopup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-6 overflow-hidden relative"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-slate-100 dark:bg-slate-800">
              {isWatchingAd && (
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 5, ease: "linear" }}
                  className="h-full bg-blue-600"
                />
              )}
            </div>

            <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-3xl flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
              <Star className="w-10 h-10 animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">{t.watchAd}</h3>
              <p className="text-slate-500 dark:text-slate-400 font-medium">{t.adPrompt}</p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleWatchAd}
                disabled={isWatchingAd}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isWatchingAd ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Watching...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    {t.watchNow}
                  </>
                )}
              </button>
              {!isWatchingAd && (
                <button
                  onClick={() => setShowAdPopup(false)}
                  className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  {t.cancel}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-[#1A1A1A] dark:text-slate-50 font-sans selection:bg-blue-100 transition-colors duration-200">
      <AdPopup />
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={reset}
          >
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">AI Suite</h1>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{t.poweredBy}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {user && userData && (
              <div className="hidden md:flex items-center gap-3 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-100 dark:border-blue-800">
                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-xs font-bold">{userData.credits} {t.credits}</span>
                </div>
                {userData.isPremium && (
                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-full uppercase tracking-wider border border-amber-200 dark:border-amber-800">
                    Pro
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setLanguage(prev => prev === 'en' ? 'bn' : 'en')}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-2 group/lang"
              title={t.language}
            >
              <Languages className="w-5 h-5 transition-transform group-hover/lang:scale-110" />
              <span className="text-xs font-bold hidden sm:inline">{language === 'en' ? 'বাংলা' : 'English'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDarkMode(prev => !prev)}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-all group/theme"
              title={isDarkMode ? t.lightMode : t.darkMode}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isDarkMode ? 'sun' : 'moon'}
                  initial={{ y: 10, opacity: 0, rotate: 45 }}
                  animate={{ y: 0, opacity: 1, rotate: 0 }}
                  exit={{ y: -10, opacity: 0, rotate: -45 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center justify-center"
                >
                  {isDarkMode ? (
                    <Sun className="w-5 h-5 transition-transform group-hover/theme:rotate-12" />
                  ) : (
                    <Moon className="w-5 h-5 transition-transform group-hover/theme:-rotate-12" />
                  )}
                </motion.div>
              </AnimatePresence>
            </button>

            <button 
              type="button"
              onClick={() => setActiveTab(activeTab === 'history' ? 'home' : 'history')}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-all group/history"
              title={t.history}
            >
              <History className="w-5 h-5 transition-transform group-hover/history:rotate-12" />
            </button>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800" />

            {user ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-blue-500 shadow-sm hidden sm:block">
                  <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all group/logout"
                  title={t.logout}
                >
                  <LogOut className="w-5 h-5 transition-transform group-hover/logout:translate-x-0.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 group/login"
              >
                <LogIn className="w-4 h-4 transition-transform group-hover/login:translate-x-0.5" />
                <span className="hidden sm:inline">{t.login}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 relative">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className="fixed top-24 left-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 font-bold text-sm min-w-[300px] justify-between"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5" />
                {error}
              </div>
              <button onClick={() => setError(null)} className="ml-4 hover:opacity-70 transition-opacity">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AIChat />
            </motion.div>
          ) : activeTab === 'profile' ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ProfileView />
            </motion.div>
          ) : activeTab === 'history' ? (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto space-y-6 pb-24"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                  <History className="w-6 h-6 text-blue-600" /> {t.history}
                </h2>
                <button 
                  onClick={clearHistory}
                  className="text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {t.clearHistory}
                </button>
              </div>
              {history.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300">
                    <History className="w-8 h-8" />
                  </div>
                  <p className="text-slate-500 font-medium">{t.noHistory}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div key={item.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 card-shadow">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold rounded uppercase">{item.toolName}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <button 
                          onClick={() => {
                            setSelectedToolId(item.toolId);
                            setOutput(item.output);
                            setActiveTab('home');
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                        {item.input}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            selectedToolId ? (
              <motion.div
                key="tool"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-5xl mx-auto pb-24"
              >
                {/* Tool Content */}
                <div className="mb-8 flex items-center justify-between">
                  <button 
                    onClick={() => setSelectedToolId(null)}
                    className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" /> {t.back}
                  </button>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${selectedTool?.color}`}>
                      {selectedTool?.icon}
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-900 dark:text-white">
                        {language === 'bn' ? t[selectedToolId as keyof typeof t] as string : selectedTool?.name}
                      </h2>
                      <p className="text-xs text-slate-500 font-medium">
                        {language === 'bn' ? t[`${selectedToolId}Desc` as keyof typeof t] as string : selectedTool?.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Input */}
                  <div className="space-y-6">
                    {selectedToolId === 'resume' ?
                      <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl space-y-8">
                        {/* Resume Steps */}
                        <div className="flex items-center justify-between mb-4">
                          {[1, 2, 3, 4, 5].map((step) => (
                            <div key={step} className="flex items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${resumeStep >= step ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                {step}
                              </div>
                              {step < 5 && <div className={`w-4 sm:w-8 h-[2px] ${resumeStep > step ? 'bg-blue-600' : 'bg-slate-100 dark:bg-slate-800'}`} />}
                            </div>
                          ))}
                        </div>

                        <div className="space-y-8">
                          {/* Progress Bar */}
                          <div className="flex items-center gap-2 mb-8">
                            {[1, 2, 3, 4, 5].map((step) => (
                              <div 
                                key={step} 
                                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step <= resumeStep ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`}
                              />
                            ))}
                          </div>

                          <AnimatePresence mode="wait">
                        {resumeStep === 0 && (
                          <motion.section 
                            key="stepTemplate"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-6"
                          >
                            <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                              <Layout className="w-5 h-5 text-blue-600" /> {t.selectTemplate}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {(['modern', 'classic', 'minimal'] as CVTemplate[]).map((template) => (
                                <button
                                  key={template}
                                  onClick={() => setSelectedTemplate(template)}
                                  className={`p-4 rounded-2xl border-2 transition-all text-left space-y-2 ${selectedTemplate === template ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}`}
                                >
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedTemplate === template ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                    <Layout className="w-5 h-5" />
                                  </div>
                                  <div className="font-bold capitalize text-slate-900 dark:text-white">{template}</div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {template === 'modern' && t.modernDesc}
                                    {template === 'classic' && t.classicDesc}
                                    {template === 'minimal' && t.minimalDesc}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </motion.section>
                        )}

                        {resumeStep === 1 && (
                          <motion.section 
                            key="step0"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-6"
                          >
                            <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                              <FileUser className="w-5 h-5 text-blue-600" /> {t.personalInfo}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.fullName}</label>
                                <input
                                  type="text"
                                  placeholder={t.fullNamePlaceholder}
                                  value={resumeData.personal.name}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, name: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.jobTitle}</label>
                                <input
                                  type="text"
                                  placeholder={t.jobTitlePlaceholder}
                                  value={resumeData.personal.title}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, title: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.emailLabel}</label>
                                <input
                                  type="email"
                                  placeholder="example@mail.com"
                                  value={resumeData.personal.email}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, email: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.phone}</label>
                                <input
                                  type="text"
                                  placeholder={t.phonePlaceholder}
                                  value={resumeData.personal.phone}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, phone: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.address}</label>
                                <input
                                  type="text"
                                  placeholder={t.addressPlaceholder}
                                  value={resumeData.personal.address}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, address: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.summary}</label>
                                <textarea
                                  placeholder={t.summaryPlaceholder}
                                  value={resumeData.personal.summary}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, summary: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all h-24 resize-none dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">LinkedIn</label>
                                <input
                                  type="text"
                                  placeholder="linkedin.com/in/username"
                                  value={resumeData.personal.linkedin}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, linkedin: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">GitHub</label>
                                <input
                                  type="text"
                                  placeholder="github.com/username"
                                  value={resumeData.personal.github}
                                  onChange={e => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, github: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all dark:text-white"
                                />
                              </div>
                            </div>
                          </motion.section>
                        )}

                        {resumeStep === 2 && (
                          <motion.section 
                            key="step1"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-6"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                                <Briefcase className="w-5 h-5 text-blue-600" /> {t.experience}
                              </h3>
                              <button 
                                onClick={addExperience}
                                className="text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-xl flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-all"
                              >
                                <Plus className="w-3.5 h-3.5" /> {t.addMore}
                              </button>
                            </div>
                            <div className="space-y-4">
                              {resumeData.experience.map((exp, i) => (
                                <div key={i} className="p-6 border border-slate-100 dark:border-slate-800 rounded-[2rem] bg-slate-50/50 dark:bg-slate-800/50 space-y-4 relative group">
                                  {resumeData.experience.length > 1 && (
                                    <button 
                                      onClick={() => removeExperience(i)}
                                      className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <input
                                      type="text"
                                      placeholder={t.companyPlaceholder}
                                      value={exp.company}
                                      onChange={e => {
                                        const newExp = [...resumeData.experience];
                                        newExp[i].company = e.target.value;
                                        setResumeData(prev => ({ ...prev, experience: newExp }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder={t.rolePlaceholder}
                                      value={exp.role}
                                      onChange={e => {
                                        const newExp = [...resumeData.experience];
                                        newExp[i].role = e.target.value;
                                        setResumeData(prev => ({ ...prev, experience: newExp }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder={t.durationPlaceholder}
                                      value={exp.dates}
                                      onChange={e => {
                                        const newExp = [...resumeData.experience];
                                        newExp[i].dates = e.target.value;
                                        setResumeData(prev => ({ ...prev, experience: newExp }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2 dark:text-white"
                                    />
                                  </div>
                                  <textarea
                                    placeholder={t.descPlaceholder}
                                    value={exp.description}
                                    onChange={e => {
                                      const newExp = [...resumeData.experience];
                                      newExp[i].description = e.target.value;
                                      setResumeData(prev => ({ ...prev, experience: newExp }));
                                    }}
                                    className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none dark:text-white"
                                  />
                                </div>
                              ))}
                            </div>
                          </motion.section>
                        )}

                        {resumeStep === 3 && (
                          <motion.section 
                            key="step2"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-6"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                                <BookOpen className="w-5 h-5 text-blue-600" /> {t.education}
                              </h3>
                              <button 
                                onClick={addEducation}
                                className="text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-xl flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-all"
                              >
                                <Plus className="w-3.5 h-3.5" /> {t.addMore}
                              </button>
                            </div>
                            <div className="space-y-4">
                              {resumeData.education.map((edu, i) => (
                                <div key={i} className="p-6 border border-slate-100 dark:border-slate-800 rounded-[2rem] bg-slate-50/50 dark:bg-slate-800/50 space-y-4 relative">
                                  {resumeData.education.length > 1 && (
                                    <button 
                                      onClick={() => removeEducation(i)}
                                      className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <input
                                      type="text"
                                      placeholder={t.degreePlaceholder}
                                      value={edu.degree}
                                      onChange={e => {
                                        const newEdu = [...resumeData.education];
                                        newEdu[i].degree = e.target.value;
                                        setResumeData(prev => ({ ...prev, education: newEdu }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder={t.institutePlaceholder}
                                      value={edu.institute}
                                      onChange={e => {
                                        const newEdu = [...resumeData.education];
                                        newEdu[i].institute = e.target.value;
                                        setResumeData(prev => ({ ...prev, education: newEdu }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder={t.yearPlaceholder}
                                      value={edu.year}
                                      onChange={e => {
                                        const newEdu = [...resumeData.education];
                                        newEdu[i].year = e.target.value;
                                        setResumeData(prev => ({ ...prev, education: newEdu }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.section>
                        )}

                        {resumeStep === 4 && (
                          <motion.section 
                            key="step3"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-6"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                                <Code className="w-5 h-5 text-blue-600" /> {t.projects}
                              </h3>
                              <button 
                                onClick={addProject}
                                className="text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-xl flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-all"
                              >
                                <Plus className="w-3.5 h-3.5" /> {t.addMore}
                              </button>
                            </div>
                            <div className="space-y-4">
                              {resumeData.projects.map((proj, i) => (
                                <div key={i} className="p-6 border border-slate-100 dark:border-slate-800 rounded-[2rem] bg-slate-50/50 dark:bg-slate-800/50 space-y-4 relative">
                                  {resumeData.projects.length > 1 && (
                                    <button 
                                      onClick={() => removeProject(i)}
                                      className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <input
                                      type="text"
                                      placeholder={t.projectNamePlaceholder}
                                      value={proj.name}
                                      onChange={e => {
                                        const newProj = [...resumeData.projects];
                                        newProj[i].name = e.target.value;
                                        setResumeData(prev => ({ ...prev, projects: newProj }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder={t.projectLinkPlaceholder}
                                      value={proj.link}
                                      onChange={e => {
                                        const newProj = [...resumeData.projects];
                                        newProj[i].link = e.target.value;
                                        setResumeData(prev => ({ ...prev, projects: newProj }));
                                      }}
                                      className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    />
                                  </div>
                                  <textarea
                                    placeholder={t.projectDescPlaceholder}
                                    value={proj.description}
                                    onChange={e => {
                                      const newProj = [...resumeData.projects];
                                      newProj[i].description = e.target.value;
                                      setResumeData(prev => ({ ...prev, projects: newProj }));
                                    }}
                                    className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none dark:text-white"
                                  />
                                </div>
                              ))}
                            </div>
                          </motion.section>
                        )}

                        {resumeStep === 5 && (
                          <motion.section 
                            key="step4"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="space-y-6"
                          >
                            <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                              <CheckCircle className="w-5 h-5 text-blue-600" /> {t.skillsCert}
                            </h3>
                            <div className="space-y-5">
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.certifications}</label>
                                <input
                                  type="text"
                                  placeholder={t.certPlaceholder}
                                  value={resumeData.certifications}
                                  onChange={e => setResumeData(prev => ({ ...prev, certifications: e.target.value }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.topSkills}</label>
                                <input
                                  type="text"
                                  placeholder={t.skillsPlaceholder}
                                  value={resumeData.skills.skills}
                                  onChange={e => setResumeData(prev => ({ ...prev, skills: { ...prev.skills, skills: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">{t.languages}</label>
                                <input
                                  type="text"
                                  placeholder={t.langPlaceholder}
                                  value={resumeData.skills.languages}
                                  onChange={e => setResumeData(prev => ({ ...prev, skills: { ...prev.skills, languages: e.target.value } }))}
                                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                                />
                              </div>
                            </div>
                          </motion.section>
                        )}
                      </AnimatePresence>

                      <div className="flex items-center justify-between pt-8 border-t border-slate-100 dark:border-slate-800">
                        <button
                          onClick={() => setResumeStep(prev => Math.max(0, prev - 1))}
                          disabled={resumeStep === 0}
                          className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-0 transition-all flex items-center gap-2"
                        >
                          <ChevronLeft className="w-4 h-4" /> {t.prevStep}
                        </button>
                        
                        {resumeStep < 5 ? (
                          <button
                            onClick={() => setResumeStep(prev => Math.min(5, prev + 1))}
                            className="px-8 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-all flex items-center gap-2"
                          >
                            {t.nextStep} <ChevronRight className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-bold rounded-xl hover:shadow-xl hover:shadow-blue-200 dark:hover:shadow-none disabled:opacity-50 transition-all flex items-center gap-2"
                          >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {t.generateResume}
                          </button>
                        )}
                      </div>
                    </div>
                  :
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">{t.yourInput}</label>
                        <textarea
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder={t[`${selectedTool.id}Placeholder` as keyof typeof t] as string || selectedTool.placeholder}
                          className="w-full h-56 p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2rem] focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all resize-none text-slate-800 dark:text-white placeholder:text-slate-400 font-medium"
                        />
                      </div>
                      <button
                        onClick={handleGenerate}
                        disabled={isLoading || !input.trim()}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200 dark:shadow-none disabled:shadow-none active:scale-[0.98]"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t.generating}
                          </>
                        ) : (
                          <>
                            <Send className="w-5 h-5" />
                            {t[`${selectedTool.id}Button` as keyof typeof t] as string || selectedTool.buttonText}
                          </>
                        )}
                      </button>
                    </div>
                  }
                </div>

                {/* Right Column: Output */}
                <div className="space-y-6">
                  <AnimatePresence>
                    {output && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4 pt-4"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.result}</label>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setShowPreview(!showPreview)}
                              className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-800/50 px-4 py-2 rounded-xl transition-all"
                            >
                              <Eye className="w-4 h-4" />
                              {showPreview ? t.editMode : t.showPreview}
                            </button>
                            {selectedToolId === 'resume' && (
                              <div className="flex flex-col items-end gap-1">
                                <button
                                  onClick={handleDownloadPDF}
                                  disabled={isDownloading}
                                  className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-all shadow-lg shadow-blue-100 dark:shadow-none disabled:bg-slate-400 disabled:shadow-none"
                                >
                                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                  {isDownloading ? t.generating : t.downloadPDF}
                                </button>
                                {downloadError && (
                                  <span className="text-[10px] text-red-500 font-medium">{downloadError}</span>
                                )}
                              </div>
                            )}
                            <button
                              onClick={handleCopy}
                              className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 rounded-xl transition-all"
                            >
                              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                              {copied ? t.copied : t.copy}
                            </button>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                          {showPreview && selectedToolId === 'resume' ? (
                            <div className="p-8 sm:p-12 bg-white min-h-[1000px]">
                              <ResumePreview data={resumeData} content={output} template={cvTemplate} t={t} />
                            </div>
                          ) : (
                            <div className="p-8 prose prose-slate dark:prose-invert max-w-none bg-white dark:bg-slate-800/30">
                              <Markdown>{output}</Markdown>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Hidden Resume for PDF Generation */}
                  {selectedToolId === 'resume' && output && (
                    <div className="fixed -left-[9999px] top-0">
                      <div ref={resumeRef} className="w-[210mm] bg-white p-12">
                        <ResumePreview data={resumeData} content={output} template={cvTemplate} t={t} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24"
            >
              <div className="col-span-full mb-8">
                <h2 className="text-4xl font-extrabold mb-3 tracking-tight text-slate-900 dark:text-white">{t.heroTitle}</h2>
                <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl">{t.heroSubtitle}</p>
              </div>
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setSelectedToolId(tool.id)}
                  className="group relative bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 text-left transition-all hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-2 card-shadow overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${tool.color} opacity-[0.03] rounded-bl-full transition-transform group-hover:scale-110`} />
                  
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3 ${tool.color}`}>
                    {tool.icon}
                  </div>
                  
                  <h3 className="text-xl font-black mb-2 text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                    {language === 'bn' ? t[tool.id as keyof typeof t] as string : tool.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    {language === 'bn' ? t[`${tool.id}Desc` as keyof typeof t] as string : tool.description}
                  </p>
                  
                  <div className="mt-6 flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-widest opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                    {t.getStarted} <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              ))}
            </motion.div>
          )
        )}
        </AnimatePresence>
      </main>

      <BottomNav />

      <footer className="mt-auto py-8 border-t border-slate-200 dark:border-slate-800 mb-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} {t.footerText}
          </p>
        </div>
      </footer>
    </div>
  </ErrorBoundary>
);
}
