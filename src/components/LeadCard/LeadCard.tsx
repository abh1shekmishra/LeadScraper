'use client';

import { useState } from 'react';
import {
  Star, Phone, Globe, MapPin, Mail, MessageSquare,
  ExternalLink, Loader2, Sparkles, Check,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Lead } from '@/types/lead';
import { useLeadStore } from '@/store/useLeadStore';
import CopyButton from './CopyButton';
import OutreachModal from './OutreachModal';

interface LeadCardProps { lead: Lead; }

export default function LeadCard({ lead }: LeadCardProps) {
  const { enrichLeadEmail, generateOutreach } = useLeadStore();
  const [modalOpen, setModalOpen] = useState(false);

  const { business, email, outreach, isGeneratingOutreach, isEnrichingEmail, reachedOut } = lead;
  const gap = lead.pitchBadge;

  const confidenceBadge = {
    verified: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30',
    inferred: 'bg-amber-400/15 text-amber-200 border-amber-400/30',
    unknown: 'bg-white/8 text-white/50 border-white/15',
  }[email.confidence];

  // Generate if needed, then open the modal. Re-opening an existing draft is instant.
  const openOutreach = async () => {
    if (!outreach) await generateOutreach(lead.id);
    setModalOpen(true);
  };

  return (
    <div className={clsx(
      'glass glass-hi rounded-2xl p-5 flex flex-col gap-4 transition-colors',
      reachedOut ? 'border-emerald-400/25' : 'glass-hover',
    )}>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-white text-base leading-snug">{business.name}</h3>
              {lead.qualification && (
                <span className={clsx(
                  'text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0',
                  lead.qualification.score === 'hot'  ? 'bg-rose-500/15 border-rose-400/30 text-rose-200' :
                  lead.qualification.score === 'warm' ? 'bg-amber-500/15 border-amber-400/30 text-amber-200' :
                  'bg-white/8 border-white/15 text-white/50',
                )}>
                  {lead.qualification.score === 'hot' ? '🔥 Hot' : lead.qualification.score === 'warm' ? '⚡ Warm' : 'Cold'}
                </span>
              )}
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
              {reachedOut && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-400/15 border-emerald-400/30 text-emerald-200 flex items-center gap-1 flex-shrink-0">
                  <Check className="w-3 h-3" /> Reached out
                </span>
              )}
            </div>
            <span className="text-xs text-white/40 capitalize">{business.category}</span>
          </div>
          {business.rating && (
            <div className="flex items-center gap-1 flex-shrink-0 glass px-2 py-1 rounded-lg">
              <Star className="w-3 h-3 text-amber-300 fill-amber-300" />
              <span className="text-xs font-semibold text-amber-200">{business.rating}</span>
              {business.reviewCount && <span className="text-xs text-white/40">({business.reviewCount})</span>}
            </div>
          )}
        </div>

        {lead.qualification && (
          <div className="mt-2.5 space-y-1.5">
            <div className="px-3 py-2 rounded-xl glass">
              <p className="text-xs text-white/75">
                <span className="text-white/40">Opportunity: </span>
                {lead.qualification.opportunity}
              </p>
            </div>
            {lead.qualification.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lead.qualification.reasons.map((tag, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full glass text-white/55">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contact info */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2 text-xs text-white/55">
          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-white/35" />
          <span className="leading-relaxed">{business.address}</span>
        </div>
        {business.phone && (
          <div className="flex items-center gap-2 text-xs text-white/55">
            <Phone className="w-3.5 h-3.5 flex-shrink-0 text-white/35" />
            <span>{business.phone}</span>
          </div>
        )}
        {business.website ? (
          <div className="flex items-center gap-2 text-xs">
            <Globe className="w-3.5 h-3.5 flex-shrink-0 text-white/35" />
            <a href={business.website} target="_blank" rel="noopener noreferrer"
              className="text-violet-300 hover:text-violet-200 hover:underline truncate max-w-[200px]">
              {business.website.replace(/^https?:\/\//, '')}
            </a>
            <a href={business.googleMapsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3 text-white/35 hover:text-white/60" />
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-rose-300/70">
            <Globe className="w-3.5 h-3.5" />
            <span>No website detected</span>
          </div>
        )}
      </div>

      {/* Email */}
      <div className="border-t border-white/10 pt-3">
        {email.address ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Mail className="w-3.5 h-3.5 text-white/35 flex-shrink-0" />
            <span className="text-xs text-white/75">{email.address}</span>
            <span className={clsx('text-[11px] px-2 py-0.5 rounded-full border', confidenceBadge)}>
              {email.confidence}
            </span>
            <CopyButton text={email.address} />
          </div>
        ) : (
          <button onClick={() => enrichLeadEmail(lead.id)} disabled={isEnrichingEmail}
            className="flex items-center gap-2 text-xs text-white/55 hover:text-white transition-colors disabled:opacity-50">
            {isEnrichingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            {isEnrichingEmail ? 'Finding email...' : 'Find Email'}
          </button>
        )}
      </div>

      {/* Outreach action */}
      <div className="border-t border-white/10 pt-3">
        <button
          onClick={openOutreach}
          disabled={isGeneratingOutreach}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all',
            isGeneratingOutreach
              ? 'glass text-white/50'
              : outreach
                ? 'glass glass-hover text-violet-200'
                : 'text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-lg shadow-violet-500/20',
          )}
        >
          {isGeneratingOutreach ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Writing outreach...</>
          ) : outreach ? (
            <><MessageSquare className="w-3.5 h-3.5" />View outreach</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" />Generate outreach</>
          )}
        </button>
      </div>

      {modalOpen && outreach && (
        <OutreachModal lead={lead} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
