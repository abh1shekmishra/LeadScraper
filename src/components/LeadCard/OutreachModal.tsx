'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X, Check, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { Lead } from '@/types/lead';
import { useLeadStore } from '@/store/useLeadStore';
import CopyButton from './CopyButton';

interface OutreachModalProps {
  lead: Lead;
  onClose: () => void;
}

type OutreachTab = 'whatsapp' | 'followups' | 'email';

export default function OutreachModal({ lead, onClose }: OutreachModalProps) {
  const { markReached } = useLeadStore();
  const [activeTab, setActiveTab] = useState<OutreachTab>('whatsapp');
  const [edited, setEdited] = useState<Record<string, string>>({});

  const { business, outreach } = lead;
  const gap = lead.pitchBadge;

  // Correct country code for any country, straight from Google's intl number.
  const waPhone = (business.internationalPhone ?? business.phone ?? '').replace(/\D/g, '');
  const waLink = (msg: string) => `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;

  const getText = (key: string, fallback: string) => edited[key] ?? fallback;
  const setText = (key: string, val: string) => setEdited((p) => ({ ...p, [key]: val }));

  const handleReached = () => {
    markReached(lead.id);
    onClose();
  };

  if (!outreach || typeof document === 'undefined') return null;

  const FOLLOW_UPS = [
    { label: 'Day 3', key: 'fu1', fallback: outreach.followUp1 },
    { label: 'Day 7', key: 'fu2', fallback: outreach.followUp2 },
    { label: 'Day 14', key: 'fu3', fallback: outreach.followUp3 },
  ];

  const WA_VERSIONS = [
    { key: 'waCurious', label: 'Version 1', fallback: outreach.whatsappCurious },
    { key: 'waDirect', label: 'Version 2', fallback: outreach.whatsappDirect },
    { key: 'waFriendly', label: 'Version 3', fallback: outreach.whatsappFriendly },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade"
      onClick={onClose}
    >
      <div
        className="glass-strong glass-hi rounded-3xl w-full max-w-lg max-h-[86vh] flex flex-col overflow-hidden animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-white text-[15px] leading-tight truncate">{business.name}</h3>
              {gap && (
                <span className={clsx(
                  'text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0',
                  gap.tone === 'hot'
                    ? 'bg-rose-500/15 border-rose-400/30 text-rose-200'
                    : 'bg-amber-500/15 border-amber-400/30 text-amber-200',
                )}>
                  {gap.label}
                </span>
              )}
            </div>
            <p className="text-xs text-white/45 mt-0.5">Pick a message, send it, then mark the lead.</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full glass glass-hover flex items-center justify-center text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-4">
          <div className="flex gap-1 glass rounded-xl p-1">
            {([
              { id: 'whatsapp', label: '💬 WhatsApp' },
              { id: 'followups', label: '🔁 Follow-ups' },
              { id: 'email', label: '✉️ Email' },
            ] as { id: OutreachTab; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-all',
                  activeTab === tab.id
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/55 hover:text-white/90',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'whatsapp' && (
            <div className="space-y-3">
              <p className="text-xs text-white/45">Pick the tone that feels right and send it first.</p>
              {WA_VERSIONS.map((v) => (
                <div key={v.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/55">{v.label}</span>
                    <div className="flex gap-2">
                      <CopyButton text={getText(v.key, v.fallback)} label="Copy" />
                      <a
                        href={waLink(getText(v.key, v.fallback))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-400/15 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-400/25 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />WA
                      </a>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl glass text-xs text-white/85 resize-none focus:outline-none focus:border-violet-400/50 leading-relaxed"
                    value={getText(v.key, v.fallback)}
                    onChange={(e) => setText(v.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'followups' && (
            <div className="space-y-3">
              <p className="text-xs text-white/45">Send on WhatsApp if no reply. Most people respond by day 7.</p>
              {FOLLOW_UPS.map((fu) => {
                const msg = getText(fu.key, fu.fallback);
                return (
                  <div key={fu.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white/55">{fu.label}</span>
                      <div className="flex gap-2">
                        <CopyButton text={msg} label="Copy" />
                        <a
                          href={waLink(msg)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-400/15 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-400/25 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />WA
                        </a>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl glass text-xs text-white/85 resize-none focus:outline-none focus:border-violet-400/50 leading-relaxed"
                      value={msg}
                      onChange={(e) => setText(fu.key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'email' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/45">A plain, friendly heads-up</span>
                <CopyButton
                  text={`Subject: ${getText('subj', outreach.emailSubject)}\n\n${getText('body', outreach.emailBody)}`}
                  label="Copy All"
                />
              </div>
              <div className="px-3 py-2 rounded-xl glass flex items-center gap-2">
                <span className="text-xs text-white/45 flex-shrink-0">Subject:</span>
                <input
                  className="flex-1 bg-transparent text-xs text-white/90 focus:outline-none"
                  value={getText('subj', outreach.emailSubject)}
                  onChange={(e) => setText('subj', e.target.value)}
                />
                <CopyButton text={getText('subj', outreach.emailSubject)} />
              </div>
              <textarea
                rows={9}
                className="w-full px-3 py-2 rounded-xl glass text-xs text-white/85 resize-none focus:outline-none focus:border-violet-400/50 leading-relaxed"
                value={getText('body', outreach.emailBody)}
                onChange={(e) => setText('body', e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-white/10">
          {lead.reachedOut && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-300 mr-auto">
              <MessageSquare className="w-3.5 h-3.5" /> Already marked
            </span>
          )}
          <button
            onClick={onClose}
            className={clsx(
              'px-4 py-2 rounded-xl text-sm font-medium glass glass-hover text-white/70 hover:text-white',
              !lead.reachedOut && 'ml-auto',
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleReached}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
          >
            <Check className="w-4 h-4" /> Reached
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
