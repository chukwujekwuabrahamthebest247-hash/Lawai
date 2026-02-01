
import React from 'react';
import { GroundingSource } from '../types';

interface SourceCardProps {
  source: GroundingSource;
}

const SourceCard: React.FC<SourceCardProps> = ({ source }) => {
  return (
    <a
      href={source.uri}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
    >
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-blue-100 rounded text-blue-600">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <span className="text-xs font-medium text-slate-700 truncate max-w-[200px]">
        {source.title}
      </span>
    </a>
  );
};

export default SourceCard;
