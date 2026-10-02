import { getSavedUsername } from '../player/identity';

export interface LeaderboardEntry {
  username: string;
  score: number;
  timeMs: number;
  completed: boolean;
  awareness: number;
  at: number; // epoch ms
}

const LOCAL_KEY = 'outplayed.leaderboard';
const MAX_ENTRIES = 15;

function readLocal(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore
  }
}

function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    return a.timeMs - b.timeMs;
  });
}

/** Upsert: keep best score per username (case-insensitive). */
function upsert(list: LeaderboardEntry[], entry: LeaderboardEntry): LeaderboardEntry[] {
  const key = entry.username.toLowerCase();
  const next = list.filter((e) => e.username.toLowerCase() !== key);
  next.push(entry);
  return sortEntries(next).slice(0, MAX_ENTRIES);
}

/**
 * Local-first leaderboard. Also syncs to `/api/leaderboard` when deployed
 * on Vercel with KV configured; otherwise stays device-local.
 */
export const LeaderboardService = {
  async submit(partial: {
    score: number;
    timeMs: number;
    completed: boolean;
    awareness?: number;
    username?: string;
  }): Promise<void> {
    const username = (partial.username ?? getSavedUsername()).trim();
    if (!username || partial.score <= 0) return;

    const entry: LeaderboardEntry = {
      username,
      score: Math.floor(partial.score),
      timeMs: Math.floor(partial.timeMs),
      completed: !!partial.completed,
      awareness: partial.awareness ?? 0,
      at: Date.now(),
    };

    writeLocal(upsert(readLocal(), entry));

    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch {
      // offline / no API — local copy is enough
    }
  },

  async fetchTop(limit = 10): Promise<{ entries: LeaderboardEntry[]; source: 'global' | 'local' }> {
    const local = sortEntries(readLocal());

    try {
      const res = await fetch(`/api/leaderboard?limit=${limit}`, { method: 'GET' });
      if (res.ok) {
        const data = (await res.json()) as { entries?: LeaderboardEntry[] };
        if (Array.isArray(data.entries) && data.entries.length > 0) {
          // Merge remote + local so your own device scores still show if API is empty/partial
          let merged = [...data.entries];
          for (const e of local) merged = upsert(merged, e);
          return { entries: sortEntries(merged).slice(0, limit), source: 'global' };
        }
      }
    } catch {
      // fall through to local
    }

    return { entries: local.slice(0, limit), source: 'local' };
  },
};
