import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Request, Response } from 'express';
import type { Schema } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerGameContext {
  player: {
    sanity: number;
    health: number;
    inventory: string[];
    hasFlashlightOn: boolean;
  };
  location: {
    x: number;
    y: number;
    level: number;
  };
  lastAction: string;
}

interface ServerGenerationOptions {
  forceEncounter?: string | null;
  isLookAround?: boolean;
  existingRoomNarrative?: string | null;
  entityPersistence?: 'still_here' | 'gone' | null;
  nearbyEntities?: string[];
  foundItem?: string | null;
  hiddenDetail?: string | null;
  activeEncounterType?: string | null;
  isNoclip?: boolean;
}

const LEVEL_NAMES: Record<number, string> = {
  0: 'Lobby',
  1: 'HabitableZone',
  2: 'PipeDreams',
};

const SYSTEM_INSTRUCTION = `
You are the Game Engine for a text-based survival horror game set in 'The Backrooms'. 
The lore is based on the Wikidot/Liminal Archives canon.
The atmosphere is oppressive, confusing, mono-yellow (Level 0), industrial (Level 1), or claustrophobic (Level 2).

Your goal is to generate a JSON response describing the result of the player's action.
Be descriptive but concise. Focus on sensory details: the hum of lights, the smell of moist carpet, the feeling of being watched.

Rules:
1. Sanity decreases slowly over time. Low sanity causes hallucinations.
2. Almond Water restores Sanity.
3. Level 0 is the Lobby (Yellow wallpaper, fluorescent buzz).
4. Level 1 is the Habitable Zone (Concrete, fog, puddles).
5. Level 2 is Pipe Dreams (Narrow tunnels, intense heat).

LOOT & ITEMS:
- The player can find items by exploring or looking around.
- 'Almond Water': Common. Restores Sanity. Found often.
- 'Flashlight': Uncommon. Essential for dark areas.
- 'Camera': Rare. Uses a flash that can reveal or stun entities.

CRITICAL EVENT RULES:
- **Do NOT generate 'entity_encounter' events randomly.** Only generate an encounter if the PROMPT explicitly tells you a specific entity has appeared.
- **Do NOT generate 'item_found' events randomly.** Only generate an item found event if the PROMPT explicitly tells you an item has been found (via Context/Event Override).
- If the prompt says "EVENT OVERRIDE: [Entity] Encounter", you MUST describe that entity appearing and set event to 'entity_encounter'.

Combat & Encounters:
- If the player chooses to FLEE: Calculate odds based on the entity. Hounds are fast (hard to flee). Smilers are stationary but dangerous if looked at. Success = Escape to new area. Failure = Damage and remain stuck or forced to move blindly.
- If the player chooses to CONFRONT: This is highly dangerous. Most Backrooms entities cannot be killed with bare hands. Confronting usually means trying to scare it off, hide, or stand ground. High risk of massive damage or sanity loss.
`;

const gameResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    narrative: {
      type: Type.STRING,
      description: "The atmospheric text description. If 'Look Around', provide 4-5 sentences. If action, 1-2 sentences.",
    },
    visualDescription: {
      type: Type.STRING,
      description: "A very short, 3-5 word abstract visual description for the UI background context. e.g., 'Yellow Wallpaper Flickering Lights'",
    },
    event: {
      type: Type.STRING,
      enum: ['none', 'entity_encounter', 'item_found', 'sanity_drain', 'level_transport'],
      description: "The type of event that occurred.",
    },
    eventDetail: {
      type: Type.STRING,
      description: "Specifics of the event (e.g., 'Smiler', 'Almond Water', 'Noclip', 'Flashlight', 'Camera'). If none, leave empty.",
    },
    sanityChange: {
      type: Type.INTEGER,
      description: "Change in sanity value (negative for damage).",
    },
    healthChange: {
      type: Type.INTEGER,
      description: "Change in health value (negative for damage).",
    },
    hiddenDetail: {
      type: Type.STRING,
      description: "A subtle environmental detail (scratches, stain, object) not mentioned in the main narrative, only visible with a flashlight/inspection. If none, leave empty.",
    },
  },
  required: ["narrative", "event", "sanityChange", "healthChange", "visualDescription"],
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildTurnPrompt(
  context: ServerGameContext,
  recentNarratives: string[],
  options: ServerGenerationOptions
): string {
  const {
    forceEncounter,
    isLookAround,
    existingRoomNarrative,
    entityPersistence,
    nearbyEntities,
    foundItem,
    hiddenDetail,
    activeEncounterType,
    isNoclip,
  } = options;

  const levelName = LEVEL_NAMES[context.location.level] ?? String(context.location.level);
  let specificInstruction = '';

  // 0. Noclip (Highest Priority)
  if (isNoclip) {
    specificInstruction = `
       CRITICAL EVENT: NOCLIP / REALITY GLITCH.
       CONTEXT: The player has fallen through the geometry of the previous room (NOCLIP) and landed in a new Level: ${levelName}.
       Task: Describe the sickening sensation of clipping through solid matter—static filling vision, the taste of ozone, the vertigo of falling sideways through the floor or wall. Then, describe the landing in the new environment.
       Output Requirement: Set 'event' to 'none'. Focus on disorientation and the new environment.
       `;
  }
  // 1. Forced Random Encounter (Priority)
  else if (forceEncounter) {
    if (existingRoomNarrative) {
      specificInstruction = `
        CONTEXT: The player is in a known location.
        EXISTING DESCRIPTION: "${existingRoomNarrative}"
        CRITICAL OVERRIDE: A ${forceEncounter} has just appeared here!
        Task: Write a terrifying, immediate description of the ${forceEncounter} manifesting within this specific environment. Do not re-describe the room from scratch, but weave the entity into the existing setting.
        Output Requirement: Set 'event' to 'entity_encounter' and 'eventDetail' to '${forceEncounter}'.
        `;
    } else {
      specificInstruction = `
        CRITICAL OVERRIDE: A ${forceEncounter} has just appeared!
        Task: Write a terrifying, immediate description of the ${forceEncounter} manifesting or attacking.
        Output Requirement: Set 'event' to 'entity_encounter' and 'eventDetail' to '${forceEncounter}'.
        `;
    }
  }
  // 2. Entity Persistence (Revisiting a room that had a monster)
  else if (entityPersistence === 'still_here' && existingRoomNarrative) {
    specificInstruction = `
     CONTEXT: The player has returned to a room where a monster was previously seen.
     PREVIOUS STATE: "${existingRoomNarrative}"
     STATUS: The entity is STILL HERE.
     Task: Describe the player re-entering the area and spotting the entity still waiting, lurking, or pacing. It reacts to their return.
     Output Requirement: Set 'event' to 'entity_encounter' and 'eventDetail' to the entity name from the previous state.
     `;
  } else if (entityPersistence === 'gone' && existingRoomNarrative) {
    specificInstruction = `
    CONTEXT: The player has returned to a room where a monster was previously seen.
    PREVIOUS STATE: "${existingRoomNarrative}"
    STATUS: The entity is GONE.
    Task: Describe the player re-entering the area. The entity has vanished, but describe the lingering evidence (smell, scratches, silence) that it was just here. The room feels empty but heavy.
    Output Requirement: Set 'event' to 'none' (or 'item_found' if appropriate context is passed). The room is now "clean" of the monster.
    `;
  }
  // 3. Found Item (Deterministic Loot)
  else if (foundItem) {
    specificInstruction = `
    CONTEXT: The player is in this location: "${existingRoomNarrative || "A new area"}".
    ACTION: ${context.lastAction}
    EVENT OVERRIDE: The player has discovered ${foundItem}!
    Task: Describe the player discovering the ${foundItem} in the environment (e.g., resting on a pipe, floating in puddle, or hidden in debris) as a result of their action.
    Output Requirement: Set 'event' to 'item_found' and 'eventDetail' to '${foundItem}'.
    `;
  }
  // 4. Look Around (Detail expansion)
  else if (isLookAround) {
    const extraDetail = hiddenDetail
      ? `Include the discovery of this hidden detail: "${hiddenDetail}".`
      : "Create a new, subtle, unsettling detail.";

    if (existingRoomNarrative) {
      specificInstruction = `
        ACTION OVERRIDE: The player is inspecting the known surroundings in detail.
        EXISTING DESCRIPTION: "${existingRoomNarrative}"
        Task: Expand on the existing description with richer sensory details (smell, texture, sound). 4-6 sentences. ${extraDetail}
        Output Requirement: Do NOT trigger an entity encounter. Do NOT trigger 'item_found' (no items are here).
        `;
    } else {
      specificInstruction = `
        ACTION OVERRIDE: The player is inspecting the surroundings in detail.
        Task: Write a rich, atmospheric description (4-6 sentences). Focus on sensory horror. ${extraDetail}
        Output Requirement: Do NOT trigger an entity encounter. Do NOT trigger 'item_found' (no items are here).
        `;
    }
  }
  // 5. Standard Movement OR Combat Resolution (Flee/Confront) OR Item Usage
  else {
    const action = context.lastAction;
    let combatContext = "";
    let itemContext = "";

    // Item Usage Overrides
    if (action.includes("Shines Flashlight") || action.includes("Uses Flashlight against")) {
      // COMBAT FLASHLIGHT LOGIC
      if (activeEncounterType && (activeEncounterType.includes('Smiler') || activeEncounterType.includes('Hound'))) {
        itemContext = `
             COMBAT RESOLUTION: The player points the flashlight directly at the ${activeEncounterType}.
             RULE: Smilers dissolve/vanish in direct light. Hounds are photophobic and flee immediately.
             Task: Write a vivid, intense description of the ${activeEncounterType} reacting violently to the beam (e.g. the Smiler hisses and evaporates into black smoke, or the Hound yelps and scrambles into the shadows). The player is SAFE.
             Output Requirement: Set 'event' to 'none'. The encounter is over.
             `;
      } else {
        // EXPLORATION FLASHLIGHT LOGIC
        let lightReveal = "Focus on dust motes dancing in the light, the texture of the walls, or the sudden stark shadows cast by pipes and debris.";

        if (nearbyEntities && nearbyEntities.length > 0) {
          const uniqueEntities = Array.from(new Set(nearbyEntities));
          lightReveal = `CRITICAL VISUAL: The light beam catches a fleeting glimpse of danger in an adjacent area (through a door, vent, or down a hall). Hint strongly at the presence of: ${uniqueEntities.join(', ')}. (e.g. A wide grin reflecting light, a matted tail whipping around a corner). The danger is CLOSE.`;
        }

        if (hiddenDetail) {
          lightReveal += ` REVEAL HIDDEN DETAIL: The focused beam specifically highlights: "${hiddenDetail}". Describe this clearly.`;
        }

        itemContext = `
            ACTION OVERRIDE: The player is using their Flashlight to investigate dark corners.
            Task: Describe the sharp, cold beam of light cutting through the gloom. ${lightReveal}
            Output Requirement: Be vivid and sensory. Do NOT trigger 'item_found' unless explicitly told otherwise. Do NOT trigger 'entity_encounter' (they are just seeing a hint).
            `;
      }
    } else if (action.includes("Clicks Flashlight OFF")) {
      itemContext = `
        ACTION OVERRIDE: The player clicks the Flashlight OFF.
        Task: Describe the darkness rushing back in to swallow the space. The sudden loss of visual clarity, the oppressive weight of the shadows returning, and the heightened auditory senses in the dark.
        Output Requirement: Focus on the fear of the dark.
        `;
    } else if (action.includes("Takes a photo")) {
      const nearbyHint = nearbyEntities && nearbyEntities.length > 0
        ? `Hidden Danger: There are entities (${nearbyEntities.join(', ')}) nearby (in adjacent rooms). The flash might reveal a glimpse of them.`
        : "There are no entities immediately nearby.";

      itemContext = `
        ACTION OVERRIDE: The player uses a Camera Flash.
        Task: Describe the high-pitched whine of the capacitor, the blinding white strobe of the flash, and the momentary, high-contrast freeze-frame image it burns into the player's retina.
        Context: ${nearbyHint}
        Output Requirement: If entities are nearby, describe a terrifying glimpse of them in the distance or shadows. Do NOT trigger 'item_found'.
        `;
    } else if (action.includes("Drank Almond Water")) {
      itemContext = `
        ACTION OVERRIDE: The player drinks Almond Water.
        Task: Describe the sensory experience: the cool temperature of the bottle against sweating palms, the taste (is it sweet, metallic, or stale like rose water?), and the immediate physical wash of relief. Describe the mind clearing and the panic subsiding.
        Output Requirement: Set 'event' to 'none'. Set 'sanityChange' and 'healthChange' to 0 (stat changes are handled by the game engine).
        `;
    }
    // Explicitly handle escape/failure logic based on action text provided by App.tsx
    else if (action.includes("Panic ran")) {
      combatContext = `
        CONTEXT: The player successfully FLED from an entity into this new area.
        Task: Describe the frantic dash into this new room and the relief (or new horror) of escaping. The entity is left behind.
        Output Requirement: Set 'event' to 'none'. CRITICAL: Do NOT generate a new entity encounter immediately. Give the player a moment of tension/relief.
        `;
    } else if (action.includes("FAILED")) {
      combatContext = `
        CONTEXT: The player tried to FLEE but FAILED. The entity blocked them or caught up.
        Task: Describe the failed escape attempt. The entity is right on top of them. High danger.
        Output Requirement: Set 'event' to 'entity_encounter' (The entity is still here). Apply damage via healthChange.
        `;
    } else if (action.includes("CONFRONT")) {
      combatContext = `
        CONTEXT: The player is fighting or standing ground against the entity.
        Task: Describe the chaotic confrontation.
        Output Requirement: Set 'event' to 'entity_encounter' (The fight continues). Apply damage.
        `;
    }

    if (itemContext) {
      if (existingRoomNarrative) {
        specificInstruction = `
             CONTEXT: The player is in: "${existingRoomNarrative}".
             ${itemContext}
             Task: Describe this action taking place within the current environment.
             `;
      } else {
        specificInstruction = itemContext;
      }
    } else if (existingRoomNarrative) {
      specificInstruction = `
        CONTEXT: The player is in a location described as: "${existingRoomNarrative}".
        ACTION: ${context.lastAction}.
        ${combatContext}
        Task: Describe the immediate result of this action within this setting. Update the situation dynamically.
        `;
    } else {
      specificInstruction = `
        ACTION: ${context.lastAction}.
        ${combatContext}
        Task: Describe the result of the movement or action concisely (1-2 sentences). Keep the tone oppressive but efficient.
        IMPORTANT: Populate 'hiddenDetail' with a small, unnoticed environmental element (e.g. "scratches near the floor", "a drawing on the wall", "a stain under the carpet").
        `;
    }
  }

  // Construct History Context to prevent repetition
  const historyContext = recentNarratives.length > 0
    ? `
    RECENT NARRATIVE HISTORY (Last ${recentNarratives.length} turns):
    ${recentNarratives.map((n, i) => `[Turn -${recentNarratives.length - i}]: ${n}`).join('\n')}

    INSTRUCTION ON UNIQUENESS:
    - You MUST avoid repeating the exact phrasing, sentence structure, or specific adjectives used in the RECENT NARRATIVE HISTORY.
    - If in Level 0 (Lobby), while the environment is thematically repetitive, use DIFFERENT sensory details than previous turns.
    `
    : "";

  // Sanity Context for Narrative coloring
  let sanityNarrativeContext = "";
  if (context.player.hasFlashlightOn) {
    sanityNarrativeContext = "The flashlight beam provides a small anchor to reality, keeping the worst hallucinations at bay. (Sanity is stable/recovering)";
  } else if (context.location.level > 0) {
    sanityNarrativeContext = "The darkness is suffocating. Without a light, the player feels the heavy weight of paranoia and potential insanity creeping in. (Sanity is passively draining)";
  }

  return `
    Current Level: ${levelName}
    Coordinates: (${context.location.x}, ${context.location.y})
    Player Sanity: ${context.player.sanity}
    Player Health: ${context.player.health}
    Player Inventory: ${context.player.inventory.join(', ')}
    Flashlight: ${context.player.hasFlashlightOn ? "ON" : "OFF"}
    
    ${historyContext}

    ${specificInstruction}
    
    Lighting/Sanity Context: ${sanityNarrativeContext}

    If sanity is low (<30), include hallucinations in the narrative.
    If Flashlight is OFF in dark levels, increase danger/uncertainty description.
    NOTE: Passive sanity drain/boost is handled by the game engine. Only modify 'sanityChange' via the AI if a specific traumatic event occurs.
    If event is 'item_found', explicitly name the item (Almond Water, Flashlight, Camera) in eventDetail.
  `;
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = typeof err === 'object' && err !== null && 'status' in err
        ? Number((err as { status?: number }).status)
        : 0;
      const isRetryable = status === 0 || status >= 500 || status === 429;
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 400 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/game/turn', async (req: Request, res: Response) => {
    try {
      const { context, recentNarratives = [], options = {} } = req.body as {
        context?: ServerGameContext;
        recentNarratives?: string[];
        options?: ServerGenerationOptions;
      };

      if (!context || !context.player || !context.location || typeof context.lastAction !== 'string') {
        res.status(400).json({ error: 'Invalid game turn request payload.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = buildTurnPrompt(context, Array.isArray(recentNarratives) ? recentNarratives : [], options);

      const response = await generateWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: gameResponseSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      if (!response.text) {
        res.status(502).json({ error: 'Empty response received from Gemini API.' });
        return;
      }

      const parsed = JSON.parse(response.text);
      res.json(parsed);
    } catch (error) {
      console.error('Gemini generation failed:', error);
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: number }).status) || 500
        : 500;
      const message = error instanceof Error ? error.message : 'Failed to generate game turn.';
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
