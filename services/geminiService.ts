import { GameContext, GameResponseSchema, EntityType, ItemType } from '../types';

export interface GenerationOptions {
  forceEncounter?: string | null;
  isLookAround?: boolean;
  existingRoomNarrative?: string | null;
  entityPersistence?: 'still_here' | 'gone' | null;
  nearbyEntities?: EntityType[];
  foundItem?: ItemType | null;
  hiddenDetail?: string | null;
  activeEncounterType?: string | null;
  isNoclip?: boolean;
}

export const generateGameTurn = async (
  context: GameContext,
  recentNarratives: string[],
  options: GenerationOptions = {}
): Promise<GameResponseSchema | null> => {
  const response = await fetch('/api/game/turn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      context,
      recentNarratives,
      options,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData && typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      }
    } catch {
      // Ignore JSON parse errors on non-JSON error responses
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as GameResponseSchema;
  return data;
};