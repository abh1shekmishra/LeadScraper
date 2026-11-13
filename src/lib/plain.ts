// Plain-English wording for what the agent does, shared by /activity and /history.

const SKIP: [RegExp, string][] = [
  [/score cold/, 'Website already looks fine, nothing provable to point out'],
  [/no usable contact/, 'No email or WhatsApp number found'],
  [/national chain/, 'Big national chain, won’t hire a freelancer'],
  [/chain \(3\+/, 'Chain with 3+ branches'],
  [/same company already in pipeline/, 'Another branch of this business is already being contacted'],
  [/same inbox\/number|same inbox already|same recipient/, 'This email or number was already contacted for another listing'],
  [/not a buyer/, 'A school or course, not a client'],
  [/claim not re-verifiable/, 'Couldn’t re-confirm the problem, so no message'],
];

export function plainSkip(reason: string | null | undefined): string {
  if (!reason) return 'Skipped';
  return SKIP.find(([re]) => re.test(reason))?.[1] ?? reason;
}

export type EventKind = 'find' | 'check' | 'skip' | 'draft' | 'send' | 'reply' | 'gig' | 'err' | 'sys';

// One agent log line -> a short sentence a person can read at a glance.
export function plainEvent(line: string): { kind: EventKind; text: string } {
  let m: RegExpMatchArray | null;
  if (/fail|error|could not|login failed/i.test(line)) return { kind: 'err', text: line };
  if ((m = line.match(/^SENT (email|WhatsApp)( follow-up (\d))? -> (.+)$/)))
    return { kind: 'send', text: `Sent ${m[3] ? `follow-up ${m[3]} by ` : ''}${m[1]} to ${m[4]}` };
  if ((m = line.match(/^REPLY from (.+?): /))) return { kind: 'reply', text: `${m[1]} replied` };
  if ((m = line.match(/^Discover: (\d+) places, (\d+) new$/)))
    return { kind: 'find', text: `Found ${m[1]} businesses (${m[2]} new)` };
  if ((m = line.match(/^Discover: (.+)$/))) return { kind: 'find', text: `Searching Google Maps for ${m[1]}` };
  if ((m = line.match(/^Audit: (.+?) -> skip \((.+)\)$/)))
    return { kind: 'skip', text: `Skipped ${m[1]}: ${plainSkip(m[2]).toLowerCase()}` };
  if ((m = line.match(/^Audit: (.+?) -> (HOT|WARM) (.+)$/)))
    return { kind: 'check', text: `${m[2] === 'HOT' ? 'Strong' : 'Good'} lead: ${m[1]}. ${m[3]}` };
  if ((m = line.match(/^Draft: (.+?) via (email|whatsapp) -> /)))
    return { kind: 'draft', text: `Wrote ${m[2] === 'email' ? 'an email' : 'a WhatsApp message'} for ${m[1]}` };
  if ((m = line.match(/^Draft: (.+?) -> skip \((.+)\)$/))) return { kind: 'skip', text: `Skipped ${m[1]}: ${m[2]}` };
  if ((m = line.match(/^Gigs: (.+)$/))) return { kind: 'gig', text: `Checked Reddit for gigs: ${m[1]}` };
  if (/^Previews:/.test(line)) return { kind: 'draft', text: line.replace(/^Previews:/, 'Built preview sites:') };
  return { kind: 'sys', text: line };
}
