import type Phaser from 'phaser';
import { AIDirector } from '../ai/AIDirector';

const REGISTRY_KEY = 'aiDirector';

/**
 * Session-scoped AIDirector that survives GameScene → GameOver → retry.
 * Created once per browser session (or after an explicit reset from the menu).
 */
export function getAIDirector(game: Phaser.Game): AIDirector {
  const existing = game.registry.get(REGISTRY_KEY) as AIDirector | undefined;
  if (existing) return existing;
  const director = new AIDirector();
  game.registry.set(REGISTRY_KEY, director);
  return director;
}

export function resetAIDirector(game: Phaser.Game): AIDirector {
  const director = getAIDirector(game);
  director.resetSession();
  return director;
}
