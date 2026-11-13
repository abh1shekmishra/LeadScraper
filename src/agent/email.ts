import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { CONFIG } from './config';

// Your own Gmail, via SMTP + IMAP with an App Password (Google Account ->
// Security -> 2-Step Verification -> App passwords). Free, no Cloud project.
// Mail goes out as normal plain text and lands in your Sent folder.

const user = () => process.env.GMAIL_USER ?? '';
const pass = () => (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
export const emailConfigured = () => !!(user() && pass());

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export async function sendEmail(o: { to: string; subject: string; text: string; inReplyTo?: string | null }): Promise<string> {
  transport ??= nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: user(), pass: pass() },
  });
  const info = await transport.sendMail({
    from: { name: CONFIG.fromName, address: user() },
    to: o.to,
    subject: o.subject,
    text: o.text,
    // Follow-ups thread under the first email, like a real reply.
    ...(o.inReplyTo ? { inReplyTo: o.inReplyTo, references: o.inReplyTo } : {}),
  });
  return info.messageId;
}

export interface InboxScan {
  replies: { from: string; inReplyTo: string; subject: string }[];
  bounced: Set<string>; // watched addresses that came back undeliverable
}

// One pass over INBOX since `since`: who wrote to us, and which sends bounced.
export async function scanInbox(since: Date, watched: string[]): Promise<InboxScan> {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, auth: { user: user(), pass: pass() }, logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const replies: InboxScan['replies'] = [];
    const bounceUids: number[] = [];
    for await (const m of client.fetch({ since }, { envelope: true, uid: true })) {
      const from = m.envelope?.from?.[0]?.address?.toLowerCase() ?? '';
      if (/mailer-daemon|postmaster/.test(from)) bounceUids.push(m.uid);
      else replies.push({ from, inReplyTo: m.envelope?.inReplyTo ?? '', subject: m.envelope?.subject ?? '' });
    }
    const bounced = new Set<string>();
    if (bounceUids.length && watched.length) {
      for await (const m of client.fetch(bounceUids.join(','), { source: true }, { uid: true })) {
        const text = m.source?.toString('utf8').toLowerCase() ?? '';
        for (const a of watched) if (text.includes(a)) bounced.add(a);
      }
    }
    return { replies, bounced };
  } finally {
    lock.release();
    await client.logout();
  }
}

// Errors that mean "stop emailing for now", not "this one message failed".
export function emailStopReason(err: unknown): 'auth' | 'quota' | null {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === 'EAUTH' || e.responseCode === 535) return 'auth';
  if (/5\.4\.5|quota|rate limit|too many/i.test(e.message ?? '')) return 'quota';
  return null;
}
