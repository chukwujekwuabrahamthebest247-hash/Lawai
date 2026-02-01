
import React, { useState } from 'react';
import { Message } from '../types';
import SourceCard from './SourceCard';

interface ChatMessageProps {
  message: Message;
  onPlayAudio?: () => void;
  isSpeakingThis?: boolean;
  isVoiceLoading?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onPlayAudio, isSpeakingThis, isVoiceLoading }) => {
  const isUser = message.role === 'user';
  const [showSources, setShowSources] = useState(false);

  return (
    <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex flex-col max-w-[90%] md:max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        {!isUser && (
          <div className="flex items-center gap-3 mb-2 ml-1">
             <div className="w-5 h-5 rounded bg-slate-900 flex items-center justify-center text-[8px] font-black text-white">OP</div>
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">OmniSearch Pro</span>
             {onPlayAudio && (
               <button 
                onClick={onPlayAudio}
                title={message.audioBuffer ? "Instant Play Ready" : "Loading Audio..."}
                className={`p-1.5 rounded-full transition-all ${isSpeakingThis ? 'text-blue-600 bg-blue-50 animate-pulse' : isVoiceLoading ? 'text-orange-600 bg-orange-50 animate-bounce' : 'text-slate-300 hover:text-slate-900 hover:bg-slate-100'} ${message.audioBuffer ? 'ring-1 ring-blue-100' : ''}`}
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2V15H6L11 19V5Z"/></svg>
               </button>
             )}
          </div>
        )}
        
        <div 
          className={`px-5 py-4 rounded-2xl text-[14px] leading-relaxed shadow-sm ${
            isUser 
              ? 'bg-slate-900 text-white rounded-tr-none' 
              : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none ring-1 ring-slate-50'
          }`}
        >
          <div className="whitespace-pre-wrap font-medium">
            {message.content}
          </div>

          {message.images && message.images.length > 0 && (
            <div className="mt-4 space-y-2">
              {message.images.map((img, i) => (
                <img 
                  key={i} 
                  src={img} 
                  alt="Generated content" 
                  className="rounded-xl w-full max-h-96 object-cover shadow-lg border border-slate-100"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              ))}
            </div>
          )}
        </div>
        
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 w-full">
            <button 
              onClick={() => setShowSources(!showSources)}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors flex items-center gap-1"
            >
              {showSources ? 'Hide Data' : `View ${message.sources.length} Research Sources`}
            </button>
            {showSources && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                {message.sources.map((s, i) => <SourceCard key={i} source={s} />)}
              </div>
            )}
          </div>
        )}
        
        <span className="text-[9px] font-black text-slate-300 mt-2 px-1 uppercase tracking-tighter">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default ChatMessage;
