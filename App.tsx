
import React, { useState, useRef, useEffect } from 'react';
import { Message, AppStatus, ChatSession, SourceScope, VoiceGender, LegalMethod } from './types';
import { generateAIResponse, generateSpeech, decodeAudioData } from './services/aiService';
import ChatMessage from './components/ChatMessage';

const STORAGE_KEY = 'omnisearch_pro_v3';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [loadingVoiceIdx, setLoadingVoiceIdx] = useState<number | null>(null);
  const [scope, setScope] = useState<SourceScope>('NIGERIA');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('FEMALE');
  const [legalMethod, setLegalMethod] = useState<LegalMethod>('NONE');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>(localStorage.getItem('ext_image_url') || '');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    localStorage.setItem('ext_image_url', imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed.map((s: any) => ({
          ...s,
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        })));
        if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
      } catch (e) { createNewChat(); }
    } else createNewChat();
  }, []);

  useEffect(() => {
    if (sessions.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Global Audio Context Activator
  const ensureAudioContext = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Investigation',
      messages: [{
        role: 'assistant',
        content: `OmniSearch Pro online. Framework: ${legalMethod}.`,
        timestamp: new Date()
      }],
      lastModified: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    ensureAudioContext();
  };

  const updateCurrentSession = (newMessages: Message[], newTitle?: string) => {
    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: newMessages, title: newTitle || s.title, lastModified: Date.now() } : s));
  };

  // Pre-caches voice for a specific message to ensure ZERO delay on play
  const cacheVoiceMessage = async (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== 'assistant' || msg.audioBuffer) return;
    
    try {
      const ctx = await ensureAudioContext();
      const audioData = await generateSpeech(msg.content, voiceGender);
      if (audioData) {
        const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
        const updatedMessages = [...messages];
        updatedMessages[index] = { ...msg, audioBuffer: buffer };
        updateCurrentSession(updatedMessages);
        return buffer;
      }
    } catch (e) {
      console.error("Caching failed", e);
    }
    return null;
  };

  const playVoiceOutput = async (index: number) => {
    try {
      if (speakingIdx !== null) stopSpeaking();
      const ctx = await ensureAudioContext();
      
      let buffer = messages[index].audioBuffer;
      
      // If not cached yet, we fetch (with delay), otherwise it's instant
      if (!buffer) {
        setLoadingVoiceIdx(index);
        buffer = await cacheVoiceMessage(index) || undefined;
        setLoadingVoiceIdx(null);
      }

      if (buffer && ctx) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => setSpeakingIdx(null);
        currentSourceRef.current = source;
        setSpeakingIdx(index);
        source.start(0);
      }
    } catch (error) {
      console.error("Playback error:", error);
      setLoadingVoiceIdx(null);
      setSpeakingIdx(null);
    }
  };

  const stopSpeaking = () => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch (e) {}
      currentSourceRef.current = null;
    }
    setSpeakingIdx(null);
  };

  const detectImageRequest = (text: string) => {
    const keywords = ['generate image', 'draw', 'create image', 'picture of', 'visualize'];
    return keywords.some(k => text.toLowerCase().includes(k)) && imageUrl.trim() !== '';
  };

  const handleImageGeneration = async (prompt: string) => {
    try {
      const response = await fetch(imageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json();
      // Assuming API returns { url: "..." } or { image: "..." }
      return data.url || data.image || data.output || null;
    } catch (e) {
      console.error("External Image API Error:", e);
      return null;
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || status === AppStatus.LOADING) return;

    if (speakingIdx !== null) stopSpeaking();
    await ensureAudioContext();

    const userPrompt = inputValue.trim();
    const userMsg: Message = { role: 'user', content: userPrompt, timestamp: new Date() };
    const updated = [...messages, userMsg];
    updateCurrentSession(updated, messages.length <= 1 ? userPrompt.slice(0, 30) : undefined);
    
    setInputValue('');
    setStatus(AppStatus.LOADING);

    try {
      let resultText = "";
      let resultSources = [];
      let resultImages: string[] = [];

      // Route to External Image API if requested
      if (detectImageRequest(userPrompt)) {
        const generatedImg = await handleImageGeneration(userPrompt);
        if (generatedImg) {
          resultImages = [generatedImg];
          resultText = `Visual synthesis complete for: "${userPrompt}"`;
        } else {
          resultText = "Image generation service failed to respond.";
        }
      } else {
        const res = await generateAIResponse(userPrompt, [], legalMethod, scope);
        resultText = res.text;
        resultSources = res.sources;
      }

      const assistantMsg: Message = { 
        role: 'assistant', 
        content: resultText, 
        timestamp: new Date(), 
        sources: resultSources,
        images: resultImages
      };
      
      const final = [...updated, assistantMsg];
      updateCurrentSession(final);
      setStatus(AppStatus.IDLE);
      
      // Auto-cache the audio immediately upon arrival for instant playback later
      const lastIdx = final.length - 1;
      if (autoSpeak) {
        const buffer = await cacheVoiceMessage(lastIdx);
        if (buffer) playVoiceOutput(lastIdx);
      } else {
        cacheVoiceMessage(lastIdx); // Silent pre-cache
      }

    } catch (error) {
      setStatus(AppStatus.ERROR);
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans text-slate-900" onClick={() => ensureAudioContext()}>
      {/* Sidebar */}
      <aside className={`h-full bg-slate-950 flex flex-col transition-all duration-300 ease-in-out border-r border-slate-800 shrink-0 ${isSidebarOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden'}`}>
        <div className="p-4 border-b border-white/5">
          <button onClick={createNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-100 text-slate-950 rounded-xl transition-all text-sm font-bold shadow-xl">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
            New Inquiry
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
          <div>
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 px-2">History</h2>
            <div className="space-y-1">
              {sessions.map(s => (
                <button key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${currentSessionId === s.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}>
                  <div className="truncate">{s.title}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 px-2">Settings</h2>
            <div className="px-2 space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">External Image API URL</label>
                <input 
                  value={imageUrl} 
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://api.generator.com/draw"
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-[10px] focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-white min-w-0 transition-all duration-300 ease-in-out">
        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-6 sticky top-0 bg-white/80 backdrop-blur-xl z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors border border-transparent hover:border-slate-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h8m-8 6h16" /></svg>
            </button>
            <div className="flex flex-col">
              <h1 className="text-xs font-black tracking-widest uppercase text-slate-950">OmniSearch Pro</h1>
              <span className="text-[9px] font-bold text-blue-600 tracking-wider">INSTANT VOICE ENGINE</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center bg-slate-50 rounded-full p-1 border border-slate-100">
               {['NIGERIA', 'GLOBAL'].map(s => (
                 <button key={s} onClick={() => setScope(s as SourceScope)} className={`px-4 py-1.5 text-[9px] font-black rounded-full transition-all ${scope === s ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                   {s}
                 </button>
               ))}
            </div>
            <button onClick={() => setAutoSpeak(!autoSpeak)} className={`text-[9px] font-black px-4 py-2 rounded-full transition-all border ${autoSpeak ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
              AUTO-VOICE: {autoSpeak ? 'ON' : 'OFF'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar px-6 py-10">
          <div className="max-w-3xl mx-auto">
            {messages.map((msg, idx) => (
              <ChatMessage 
                key={idx} 
                message={msg} 
                onPlayAudio={msg.role === 'assistant' ? () => playVoiceOutput(idx) : undefined}
                isSpeakingThis={speakingIdx === idx}
                isVoiceLoading={loadingVoiceIdx === idx}
              />
            ))}
            {status === AppStatus.LOADING && (
              <div className="flex items-center gap-4 ml-4 mb-10">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-150"></div>
                </div>
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Synthesizing Response...</span>
              </div>
            )}
            <div ref={scrollRef} className="h-1" />
          </div>
        </main>

        <footer className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 px-1">
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Legal Methodology</span>
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                  {(['NONE', 'IRAC', 'IPAC', 'CREC'] as LegalMethod[]).map(m => (
                    <button key={m} onClick={() => setLegalMethod(m)} className={`px-4 py-1.5 text-[9px] font-bold rounded-lg transition-all ${legalMethod === m ? 'bg-white text-slate-950 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                      {m === 'NONE' ? 'GENERAL' : m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Persona</span>
                <select value={voiceGender} onChange={(e) => setVoiceGender(e.target.value as VoiceGender)} className="bg-slate-50 text-[10px] font-bold text-slate-900 border-slate-100 rounded-xl p-2 px-3 focus:ring-0 uppercase cursor-pointer">
                  <option value="FEMALE">Kore (Female)</option>
                  <option value="MALE">Fenrir (Male)</option>
                </select>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="relative group">
              <div className="relative flex items-center bg-white border-2 border-slate-200 rounded-[28px] p-1.5 shadow-sm group-focus-within:border-slate-950 group-focus-within:shadow-2xl transition-all duration-300">
                <input 
                  value={inputValue} 
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={`Consult ${legalMethod} engine...`}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] py-3.5 px-6 font-semibold"
                />
                <button type="submit" disabled={!inputValue.trim() || status === AppStatus.LOADING} className={`p-3.5 rounded-full transition-all ${!inputValue.trim() || status === AppStatus.LOADING ? 'text-slate-200 bg-slate-50' : 'bg-slate-950 text-white shadow-xl shadow-slate-900/10'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </button>
              </div>
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
