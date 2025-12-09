
export enum GamePhase {
  LOBBY = 'LOBBY',
  INPUT = 'INPUT',
  SWAP = 'SWAP',
  EDIT = 'EDIT',
  PRESENTATION = 'PRESENTATION',
  VOTE = 'VOTE',
  RESULT = 'RESULT'
}

export interface Player {
  id: string; // Peer ID
  name: string;
  score: number;
  avatarColor: string;
  isHost: boolean;
  hasSubmitted?: boolean; // Track if they are ready for next phase
}

export interface RoundData {
  originalFact: string;
  assignedToPlayerId: string; // The player who has to make the thumbnail
  thumbnail?: ThumbnailData; // The result
  votes: number;
  ownerName: string; // Name of person who wrote the fact
  ownerId: string;
}

export type ElementType = 'text' | 'image' | 'sticker' | 'shape';

export interface CanvasElement {
  id: string;
  type: ElementType;
  content: string; // Text content or Image URL/Base64
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  color?: string;
  zIndex: number;
  fontFamily?: string;
  fontSize?: number;
}

// Representing the final output.
export interface ThumbnailData {
  imageUrl?: string; 
  canvasState?: CanvasElement[]; 
  bgColor?: string;
  filterContrast?: number;
  filterSaturation?: number;
  filterBlur?: number;
}

// --- NETWORK TYPES ---

export interface GameState {
  phase: GamePhase;
  players: Player[];
  roundData: RoundData[];
  presentationIndex?: number;
}

export type NetworkMessage = 
  | { type: 'JOIN', payload: { name: string, avatarColor: string } }
  | { type: 'STATE_UPDATE', payload: GameState }
  | { type: 'SUBMIT_FACT', payload: { fact: string } }
  | { type: 'SUBMIT_THUMBNAIL', payload: { thumbnail: ThumbnailData } }
  | { type: 'VOTE', payload: { roundIndex: number } }
  | { type: 'START_GAME' };
