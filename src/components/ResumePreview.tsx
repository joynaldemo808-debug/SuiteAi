import React from 'react';
import { ResumeData, CVTemplate } from '../types';
import Markdown from 'react-markdown';
import { Mail, Phone, MapPin, Linkedin, Github } from 'lucide-react';

interface ResumePreviewProps {
  data: ResumeData;
  content: string;
  template: CVTemplate;
  t: any;
}

export const ResumePreview: React.FC<ResumePreviewProps> = ({ data, content, template, t }) => {
  const { personal } = data;

  const renderHeader = () => {
    switch (template) {
      case 'modern':
        return (
          <div className="bg-slate-900 text-white p-10 -m-12 mb-12 rounded-b-[3rem]">
            <h1 className="text-4xl font-black mb-2 tracking-tight">{personal.name}</h1>
            <p className="text-blue-400 text-xl font-bold mb-6">{personal.title}</p>
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
              <div className="flex items-center gap-2"><Mail className="w-4 h-4" /> {personal.email}</div>
              <div className="flex items-center gap-2"><Phone className="w-4 h-4" /> {personal.phone}</div>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {personal.address}</div>
              {personal.linkedin && <div className="flex items-center gap-2"><Linkedin className="w-4 h-4" /> {personal.linkedin}</div>}
              {personal.github && <div className="flex items-center gap-2"><Github className="w-4 h-4" /> {personal.github}</div>}
            </div>
          </div>
        );
      case 'classic':
        return (
          <div className="text-center border-b-2 border-slate-900 pb-8 mb-8">
            <h1 className="text-4xl font-serif font-bold uppercase tracking-widest mb-2">{personal.name}</h1>
            <p className="text-slate-600 font-serif italic mb-4">{personal.title}</p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium">
              <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {personal.email}</span>
              <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {personal.phone}</span>
              <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {personal.address}</span>
            </div>
          </div>
        );
      case 'minimal':
      default:
        return (
          <div className="mb-12">
            <h1 className="text-5xl font-light mb-4">{personal.name}</h1>
            <p className="text-slate-500 text-lg mb-8 uppercase tracking-[0.2em]">{personal.title}</p>
            <div className="space-y-1 text-slate-600 text-sm">
              <div>{personal.email} • {personal.phone}</div>
              <div>{personal.address}</div>
              <div className="flex gap-4 pt-2">
                {personal.linkedin && <span className="underline">{personal.linkedin}</span>}
                {personal.github && <span className="underline">{personal.github}</span>}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`resume-container font-sans text-slate-800 ${template} bg-white p-12 shadow-sm`}>
      {renderHeader()}
      
      <div className="space-y-10">
        {personal.summary && (
          <section>
            <h2 className={`text-lg font-bold mb-3 uppercase tracking-wider ${template === 'modern' ? 'text-blue-600' : 'text-slate-900'}`}>{t.summary}</h2>
            <p className="text-slate-600 leading-relaxed">{personal.summary}</p>
          </section>
        )}

        <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-headings:uppercase prose-headings:tracking-wider prose-headings:text-lg prose-p:text-slate-600">
          <Markdown>{content}</Markdown>
        </div>
      </div>
    </div>
  );
};
