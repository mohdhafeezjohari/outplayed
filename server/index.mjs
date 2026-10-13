/**
 * Production server for company PaaS (zip deploy).
 * Serves dist/ and stores the shared leaderboard in SQLite.
 *
 * Env:
 *   PORT            — listen port (default 8080)
 *   DATABASE_PATH   — sqlite file path (default ./data/outplayed.db)
 *   HOST            — bind address (default 0.0.0.0)
 */
import express from 'express';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_PATH =
  process.env.DATABASE_PATH || path.join(ROOT, 'data', 'outplayed.db');
const MAX = 50;

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new Database(DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS leaderboard (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    score INTEGER NOT NULL,
    time_ms INTEGER NOT NULL,
    completed INTEGER NOT NULL,
    awareness REAL NOT NULL,
    at INTEGER NOT NULL
  );
`);

const selectTop = db.prepare(`
  SELECT username, score, time_ms AS timeMs, completed, awareness, at
  FROM leaderboard
  ORDER BY score DESC,
           CASE WHEN completed THEN 0 ELSE 1 END,
           time_ms ASC
  LIMIT ?
`);

const upsertStmt = db.prepare(`
  INSERT INTO leaderboard (username, score, time_ms, completed, awareness, at)
  VALUES (@username, @score, @timeMs, @completed, @awareness, @at)
  ON CONFLICT(username) DO UPDATE SET
    score = excluded.score,
    time_ms = excluded.time_ms,
    completed = excluded.completed,
    awareness = excluded.awareness,
    at = excluded.at
`);

const countStmt = db.prepare('SELECT COUNT(*) AS n FROM leaderboard');
const trimStmt = db.prepare(`
  DELETE FROM leaderboard
  WHERE username NOT IN (
    SELECT username FROM leaderboard
    ORDER BY score DESC,
             CASE WHEN completed THEN 0 ELSE 1 END,
             time_ms ASC
    LIMIT ?
  )
`);

function sanitize(entry) {
  const username = String(entry?.username ?? '')
    .trim()
    .slice(0, 12);
  if (!/^[A-Za-z0-9_\-]{2,12}$/.test(username)) return null;
  const score = Math.floor(Number(entry?.score) || 0);
  if (score <= 0 || score > 1_000_000) return null;
  return {
    username,
    score,
    timeMs: Math.max(0, Math.floor(Number(entry?.timeMs) || 0)),
    completed: entry?.completed ? 1 : 0,
    awareness: Math.min(1, Math.max(0, Number(entry?.awareness) || 0)),
    at: Date.now(),
  };
}

function rowToEntry(row) {
  return {
    username: row.username,
    score: row.score,
    timeMs: row.timeMs,
    completed: !!row.completed,
    awareness: row.awareness,
    at: row.at,
  };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/api/leaderboard', (req, res) => {
  try {
    if (req.query.diag === '1' || req.query.diag === 'true') {
      return res.json({
        persistent: true,
        store: 'sqlite',
        databasePath: DATABASE_PATH,
        entries: countStmt.get().n,
        hint: 'SQLite linked. Leaderboard should show GLOBAL.',
      });
    }

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const entries = selectTop.all(limit).map(rowToEntry);
    return res.json({ entries, persistent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server error',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
});

app.post('/api/leaderboard', (req, res) => {
  try {
    const entry = sanitize(req.body);
    if (!entry) return res.status(400).json({ error: 'invalid entry' });

    const tx = db.transaction((e) => {
      upsertStmt.run(e);
      if (countStmt.get().n > MAX) trimStmt.run(MAX);
    });
    tx(entry);

    return res.json({
      ok: true,
      persistent: true,
      entry: {
        ...entry,
        completed: !!entry.completed,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server error',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
});

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.warn(
    `[warn] ${DIST}/index.html missing — run "npm run build" before start.`,
  );
}

app.use(
  express.static(DIST, {
    index: 'index.html',
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      }
    },
  }),
);

app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
  console.log(`sqlite: ${DATABASE_PATH}`);
  console.log(`static: ${DIST}`);
});
