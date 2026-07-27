'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export default function CopyButton({ text, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
        copied
          ? 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30'
          : 'bg-white/8 text-white/70 border-white/15 hover:bg-white/15 hover:text-white',
        className,
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {label ?? (copied ? 'Copied!' : 'Copy')}
    </button>
  );
}
