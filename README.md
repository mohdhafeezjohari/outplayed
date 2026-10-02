# THE GAME IS WATCHING

A 2D platformer built with **Phaser 3 + Vite + TypeScript**. It looks like a
simple platformer — but the game is quietly studying how you play.

> **Current status: Stages 1–6 complete** — the game observes, predicts and
> adapts to how you play, then reveals what it learned. The HUD shows the AI's
> awareness level; press **F1** for the observation debug panel.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Deploy (Vercel)

1. Push this repo to GitHub / GitLab / Bitbucket.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Vercel should auto-detect Vite. Confirm:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Click **Deploy**.

### Shared leaderboard (optional)

Scores always save on the player's device. For a **global** board on Vercel:

1. Vercel project → **Storage** → create **KV**
2. Connect it to this project (adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`)
3. Redeploy

Without KV, the in-game board still works as **this device** only.

Or from the CLI:

```bash
npm i -g vercel
vercel login
vercel          # preview
vercel --prod   # production
```

## Deploy (Docker)

This game is a static site (no backend). Production = build `dist/` and serve it.

```bash
# Build & run locally on port 8080
docker compose up --build -d
# → http://localhost:8080

# Or without compose:
docker build -t the-game-is-watching .
docker run --rm -p 8080:80 the-game-is-watching
```

Push the image to your registry, then run it on any host (VPS, ECS, Cloud Run, Kubernetes, etc.) with port 80 published.

**Without Docker:** `npm run build`, then upload `dist/` to Netlify, Vercel, Cloudflare Pages, S3+CloudFront, or any nginx/Apache host.

## Controls

| Action              | Keys                   |
| ------------------- | ---------------------- |
| Move                | `A` / `D` or `←` / `→` |
| Jump                | `SPACE` / `W` / `↑`    |
| Pause               | `P` / `Esc`            |
| AI debug panel      | `F1`                   |
| Retry (after death) | `R` or `SPACE`         |
| Menu (after death)  | `M` (resets AI memory) |

Reach the green signal gate at the end of the level. Collect cyan shards for
bonus points; avoid red spikes and the void.

## Stage 2 notes

- `BehaviourTracker` records jumps, left/right bias, idle/air time, routes,
  deaths, post-death repetition, and hazard avoidances.
- `AIDirector` maps that profile to **OBSERVE → LEARN** and an awareness %
  (no adaptive spawns yet).
- Memory persists across retries; returning to the main menu resets it.
- `DEMO_MODE = true` in `gameConfig.ts` shortens the learn window (~22s).

## Project layout

```
src/
  main.ts                 Phaser bootstrap
  config/gameConfig.ts    sizes, physics, colors, DEMO_MODE, AI timing
  events/GameEvents.ts    typed gameplay events for the AI layer
  scenes/                 Boot · Menu · Game · GameOver
  entities/               Player, Platform, Hazard (+ Enemy stub)
  systems/                LevelManager, ScoreManager (+ stubs)
  ui/                     HUD, Backdrop, AIDebugPanel
  ai/                     AIDirector, BehaviourTracker, session (+ stubs)
```

## Roadmap

1. **Stage 1** — playable platformer *(done)*
2. **Stage 2** — BehaviourTracker + AI state / awareness HUD *(done)*
3. **Stage 3** — AI Director adaptations + PredictionEngine *(done)*
4. **Stage 4** — Adaptive obstacle systems: hunters, moving platforms, timed hazards, difficulty scaling *(done)*
5. **Stage 5** — Prediction polish: locked predictions, accuracy tracking, AI level HUD *(done)*
6. **Stage 6** — Ending reveal (`RevealScene`) + presentation polish *(done)*

## Seeing the reveal

Reach the green signal gate and the game ends on **THE GAME HAS LEARNED YOU.**:
animated behaviour bars (jumping, right movement, risk taking, repetition), the
AI's prediction accuracy, and a closing quote. Dying with AI awareness ≥ 70%
also triggers it. `R` / `Space` retries and keeps the AI's memory; `M` returns
to the menu and resets it. Press `F1` in-game for the live debug panel
(including prediction accuracy).
