
export enum GameLevel {
  Lobby = 0,
  HabitableZone = 1,
  PipeDreams = 2
}

export enum EntityType {
  None = "None",
  Smiler = "Smiler",
  Hound = "Hound",
  SkinStealer = "Skin-Stealer",
  Partygoer = "Partygoer"
}

export enum ItemType {
  AlmondWater = "Almond Water",
  Flashlight = "Flashlight",
  Camera = "Camera",
  None = "None"
}

export interface PlayerState {
  sanity: number; // 0-100
  health: number; // 0-100
  inventory: ItemType[];
  hasFlashlightOn: boolean;
}

export interface LocationState {
  x: number;
  y: number;
  level: GameLevel;
}

export interface LogEntry {
  id: string;
  text: string;
  type: 'narrative' | 'system' | 'danger' | 'item';
  timestamp: number;
}

export interface GameResponseSchema {
  narrative: string;
  visualDescription: string; // Brief description for visual vibe (e.g. "Dark, wet carpet")
  event: 'none' | 'entity_encounter' | 'item_found' | 'sanity_drain' | 'level_transport';
  eventDetail: string; // Name of entity or item
  sanityChange: number;
  healthChange: number;
  hiddenDetail?: string; // A subtle environmental detail hidden in the dark
}

export interface WorldNode {
  data: GameResponseSchema | null; // Null if unvisited (Shadow Node)
  visited: boolean;
  lastVisitTurn: number; // Turn visited OR turn generated
  entityType: EntityType | null; // Stored entity state
  itemType: ItemType | null; // Stored item state
}

export interface GameContext {
  player: PlayerState;
  location: LocationState;
  lastAction: string;
}