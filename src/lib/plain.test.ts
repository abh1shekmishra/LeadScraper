import { describe, expect, it } from 'vitest';
import { plainEvent, plainSkip } from '@/lib/plain';

describe('plain English', () => {
  it('translates agent log lines', () => {
    expect(plainEvent('Discover: architects in New York')).toEqual({ kind: 'find', text: 'Searching Google Maps for architects in New York' });
    expect(plainEvent('Discover: 20 places, 18 new').text).toBe('Found 20 businesses (18 new)');
    expect(plainEvent('Audit: Acme -> skip (score cold)').text).toBe('Skipped Acme: website already looks fine, nothing provable to point out');
    expect(plainEvent('Audit: Acme -> HOT No website — 48 customers').text).toBe('Strong lead: Acme. No website — 48 customers');
    expect(plainEvent('Draft: Acme via whatsapp -> approved').text).toBe('Wrote a WhatsApp message for Acme');
    expect(plainEvent('SENT WhatsApp -> Acme').text).toBe('Sent WhatsApp to Acme');
    expect(plainEvent('SENT email follow-up 2 -> Acme').text).toBe('Sent follow-up 2 by email to Acme');
    expect(plainEvent('REPLY from Acme: WhatsApp: yes please').text).toBe('Acme replied');
    expect(plainEvent('Draft failed (check ANTHROPIC_API_KEY): x').kind).toBe('err');
  });
  it('explains skip reasons', () => {
    expect(plainSkip('no usable contact')).toBe('No email or WhatsApp number found');
    expect(plainSkip('chain (3+ branches)')).toBe('Chain with 3+ branches');
    expect(plainSkip('something new')).toBe('something new');
  });
});
