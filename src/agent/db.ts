import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// One local SQLite file shared by the agent process and the Next.js dashboard.
// WAL mode lets both read/write at once.
const DB_PATH = path.join(process.cwd(), 'data', 'agent.db');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS queries (
      key TEXT PRIMARY KEY,          -- "Pune|interior designers"
      found INTEGER,
      done_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,           -- Google place_id / cid
      query_key TEXT NOT NULL,
      country TEXT NOT NULL,
      business TEXT NOT NULL,        -- BusinessInfo JSON
      emails TEXT NOT NULL DEFAULT '[]',
      timezone TEXT,
      maps_ordering INTEGER NOT NULL DEFAULT 0,
      stage TEXT NOT NULL,           -- discovered | qualified | drafted | skipped
      skip_reason TEXT,
      email TEXT,                    -- chosen, MX-checked address
      phone TEXT,                    -- E.164
      health TEXT,                   -- SiteHealth JSON
      qualification TEXT,            -- LeadQualification JSON
      outreach TEXT,                 -- OutreachDraft JSON (follow-ups live here)
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leads_stage ON leads(stage);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      channel TEXT NOT NULL,         -- email | whatsapp
      step INTEGER NOT NULL DEFAULT 0, -- 0 first touch, 1-3 follow-ups
      variant TEXT,                  -- which draft variant, for reply-rate learning
      to_addr TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL,          -- scheduled | pending | approved | sent | rejected | failed | cancelled
      created_at INTEGER NOT NULL,
      sent_at INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS messages_status ON messages(status);

    -- Posts where someone is asking for this work (HN, Reddit).
    CREATE TABLE IF NOT EXISTS gigs (
      id TEXT PRIMARY KEY,           -- "hn:123" / "reddit:abc"
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      email TEXT,                    -- contact email found in the post
      posted_at INTEGER NOT NULL,
      status TEXT NOT NULL,          -- new | skipped | ready | done | dismissed
      fit INTEGER,
      why TEXT,
      budget TEXT,
      reply TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gigs_status ON gigs(status);

    -- Small live values the sender publishes (e.g. next allowed send time).
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    -- What the agent is doing, for the read-only activity panel.
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      line TEXT NOT NULL
    );
  `);
  // Columns added after the first release; ALTER fails harmlessly if present.
  for (const sql of [
    'ALTER TABLE messages ADD COLUMN due_at INTEGER',      // follow-ups: not before this time
    'ALTER TABLE messages ADD COLUMN msg_id TEXT',         // email Message-ID / WhatsApp message id
    'ALTER TABLE leads ADD COLUMN replied_at INTEGER',
    'ALTER TABLE leads ADD COLUMN reply_text TEXT',
    'ALTER TABLE leads ADD COLUMN preview_slug TEXT',      // concept site built for them
    'ALTER TABLE leads ADD COLUMN brand_key TEXT',         // same business across branches
    'ALTER TABLE messages ADD COLUMN priority REAL',       // higher = sent sooner
    'CREATE INDEX IF NOT EXISTS leads_brand ON leads(brand_key)',
  ]) {
    try { db.exec(sql); } catch { /* already there */ }
  }
  return db;
}

export const now = () => Date.now();
export const json = (v: unknown) => JSON.stringify(v ?? null);
export function parse<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
