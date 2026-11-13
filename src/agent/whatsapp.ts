import path from 'node:path';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

// Your own WhatsApp, through WhatsApp Web in a headless browser. First run
// prints a QR: WhatsApp on your phone -> Linked devices -> Link a device.
// The session is saved in data/wa-session, so later runs log in silently.

let client: Client | null = null;
let ready = false;

export function startWhatsApp(log: (...a: unknown[]) => void) {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(process.cwd(), 'data', 'wa-session') }),
    puppeteer: { headless: true },
  });
  client.on('qr', (qr) => {
    log('WhatsApp: scan this QR (WhatsApp > Linked devices > Link a device):');
    qrcode.generate(qr, { small: true });
  });
  client.on('ready', () => { ready = true; log(`WhatsApp: ready as +${client?.info?.wid?.user ?? '?'}`); });
  client.on('auth_failure', (m) => { ready = false; log('WhatsApp: login failed:', m); });
  client.on('disconnected', (r) => { ready = false; log('WhatsApp: disconnected:', r); });
  client.initialize().catch((e: Error) => log('WhatsApp: could not start:', e.message));
}

export const whatsappReady = () => ready;
export const ownNumber = () => (client?.info?.wid?.user ? `+${client.info.wid.user}` : null);
export async function stopWhatsApp() {
  try { await client?.destroy(); } catch { /* already gone */ }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chatIdFor(e164: string): Promise<string | null> {
  const id = await client!.getNumberId(e164.replace(/\D/g, ''));
  return id?._serialized ?? null;
}

// Returns the message id, or null when the number isn't on WhatsApp.
export async function sendWhatsApp(e164: string, body: string): Promise<string | null> {
  const chatId = await chatIdFor(e164);
  if (!chatId) return null;
  // Show "typing…" for a human-ish moment before the message lands.
  try {
    const chat = await client!.getChatById(chatId);
    await chat.sendStateTyping();
  } catch { /* new chat: no typing indicator, fine */ }
  await sleep(Math.min(12_000, 2_000 + body.length * 40));
  const msg = await client!.sendMessage(chatId, body);
  return msg.id._serialized;
}

// Their first message after `sinceMs`, if any.
export async function whatsappReplySince(e164: string, sinceMs: number): Promise<string | null> {
  const chatId = await chatIdFor(e164);
  if (!chatId) return null;
  const chat = await client!.getChatById(chatId);
  const msgs = await chat.fetchMessages({ limit: 20 });
  const reply = msgs.find((m) => !m.fromMe && m.timestamp * 1000 > sinceMs);
  return reply ? reply.body || '[media message]' : null;
}
