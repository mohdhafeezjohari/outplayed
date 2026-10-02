import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

/**
 * Shared leaderboard API (global scores).
 *
 * Needs ONE of these pairs on the Vercel project (Production):
 *   KV_REST_API_URL + KV_REST_API_TOKEN          (Vercel KV)
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (Marketplace Redis / Upstash)
 *
 * After connecting Storage → Redeploy Production.
 * Check: GET /api/leaderboard?diag=1
 */

export interface LeaderboardEntry {
  username: string;
  score: number;
  timeMs: number;
  completed: boolean;
  awareness: number;
  at: number;
}

const KEY = 'outplayed:leaderboard';
const MAX = 50;

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function redisUrl(): string | undefined {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
}

function redisToken(): string | undefined {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
}

function hasStore(): boolean {
  return !!(redisUrl() && redisToken());
}

function getRedis(): Redis | null {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function loadAll(): Promise<LeaderboardEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  const data = await redis.get<LeaderboardEntry[]>(KEY);
  return Array.isArray(data) ? data : [];
}

async function saveAll(entries: LeaderboardEntry[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(KEY, entries.slice(0, MAX));
}

function sanitize(entry: Partial<LeaderboardEntry>): LeaderboardEntry | null {
  const username = String(entry.username ?? '')
    .trim()
    .slice(0, 12);
  if (!/^[A-Za-z0-9_\-]{2,12}$/.test(username)) return null;
  const score = Math.floor(Number(entry.score) || 0);
  if (score <= 0 || score > 1_000_000) return null;
  return {
    username,
    score,
    timeMs: Math.max(0, Math.floor(Number(entry.timeMs) || 0)),
    completed: !!entry.completed,
    awareness: Math.min(1, Math.max(0, Number(entry.awareness) || 0)),
    at: Date.now(),
  };
}

function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    return a.timeMs - b.timeMs;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      // Safe diagnostics — no secrets, only whether vars exist.
      if (req.query.diag === '1' || req.query.diag === 'true') {
        return res.status(200).json({
          persistent: hasStore(),
          env: {
            KV_REST_API_URL: !!process.env.KV_REST_API_URL,
            KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
            UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
            UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
          },
          hint: hasStore()
            ? 'Store linked. Leaderboard should show GLOBAL.'
            : 'No Redis/KV env on this deployment. Storage → Connect to outplayed → Production → Redeploy.',
        });
      }

      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
      const entries = sortEntries(await loadAll()).slice(0, limit);
      return res.status(200).json({
        entries,
        persistent: hasStore(),
      });
    }

    if (req.method === 'POST') {
      const entry = sanitize(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
      if (!entry) return res.status(400).json({ error: 'invalid entry' });

      if (!hasStore()) {
        return res.status(200).json({ ok: true, persistent: false, entry });
      }

      const all = await loadAll();
      const key = entry.username.toLowerCase();
      const next = sortEntries([
        ...all.filter((e) => e.username.toLowerCase() !== key),
        entry,
      ]).slice(0, MAX);
      await saveAll(next);
      return res.status(200).json({ ok: true, persistent: true, entry });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server error',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
