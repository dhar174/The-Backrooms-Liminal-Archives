
import React from 'react';
import { PlayerState, ItemType, GameLevel, LocationState, WorldNode } from '../types';
import { Minimap } from './Minimap';

interface StatusPanelProps {
  player: PlayerState;
  level: GameLevel;
  currentLocation: LocationState;
  prevLocation: LocationState | null;
  worldGraph: Record<string, WorldNode>;
  onUseItem: (item: ItemType) => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ player, level, currentLocation, prevLocation, worldGraph, onUseItem }) => {
  return (
    <div className="w-full md:w-[450px] border-t md:border-t-0 md:border-l border-amber-900/30 bg-black/95 p-5 flex flex-col gap-5 font-vt323 h-full overflow-y-auto shadow-[-10px_0_20px_rgba(0,0,0,0.5)] z-20 text-amber-400 scrollbar-thin scrollbar-thumb-amber-900 scrollbar-track-black">
      
      {/* Level Indicator - Compact */}
      <div className="flex-shrink-0 border border-amber-700/50 p-3 bg-amber-950/20 shadow-[0_0_15px_rgba(180,83,9,0.1)]">
        <div className="flex justify-between items-end border-b border-amber-800/50 pb-1 mb-1">
            <h3 className="text-amber-500 text-base uppercase tracking-[0.2em] font-bold">Location</h3>
            <span className="text-amber-700 font-mono text-sm">X:{currentLocation.x} Y:{currentLocation.y}</span>
        </div>
        <p className="text-3xl text-amber-100 font-bold tracking-wide leading-none">LEVEL {level}</p>
        <p className="text-lg text-amber-400/80 italic mt-1">
            {level === GameLevel.Lobby && "The Lobby"}
            {level === GameLevel.HabitableZone && "Habitable Zone"}
            {level === GameLevel.PipeDreams && "Pipe Dreams"}
        </p>
      </div>

      {/* Mini-Map - Constrained Width */}
      <div className="flex-shrink-0">
         <h3 className="text-amber-600 text-base uppercase tracking-widest mb-2 border-b border-amber-900/30 pb-1">Proximity Radar</h3>
         <div className="shadow-[0_0_20px_rgba(0,0,0,0.5)] mx-auto max-w-[320px]">
            <Minimap 
                currentLocation={currentLocation} 
                prevLocation={prevLocation} 
                worldGraph={worldGraph} 
                level={level} 
            />
         </div>
      </div>

      {/* Vitals - Compact */}
      <div className="flex-shrink-0 space-y-3">
        <div>
          <div className="flex justify-between text-amber-500 mb-1 text-lg">
            <span className="font-bold">SANITY</span>
            <span className={`${player.sanity < 30 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>{player.sanity}%</span>
          </div>
          <div className="h-4 bg-gray-900 border border-gray-700/50 relative overflow-hidden rounded-sm">
            <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-20 pointer-events-none"></div>
            <div 
                className={`h-full transition-all duration-500 ease-out shadow-[0_0_10px_currentColor] ${player.sanity < 30 ? 'bg-red-600 text-red-600' : 'bg-blue-600 text-blue-600'}`}
                style={{ width: `${player.sanity}%` }} 
            />
          </div>
        </div>

        <div>
            <div className="flex justify-between text-amber-500 mb-1 text-lg">
                <span className="font-bold">HEALTH</span>
                <span className={`${player.health < 30 ? 'text-red-600 animate-pulse' : 'text-amber-400'}`}>{player.health}%</span>
            </div>
            <div className="h-4 bg-gray-900 border border-gray-700/50 relative overflow-hidden rounded-sm">
                <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-20 pointer-events-none"></div>
                <div 
                    className="h-full bg-red-700 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(220,38,38,0.6)]"
                    style={{ width: `${player.health}%` }} 
                />
            </div>
        </div>
      </div>

      {/* Inventory - Flexible */}
      <div className="flex-1 flex flex-col min-h-0">
        <h3 className="text-amber-600 text-base uppercase tracking-widest mb-2 border-b border-amber-900/30 pb-1">Inventory</h3>
        {player.inventory.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-amber-900/50 p-4 bg-amber-950/10 rounded min-h-[100px]">
                <p className="text-amber-800/60 italic text-lg">Empty pockets...</p>
            </div>
        ) : (
            <ul className="space-y-2 overflow-y-auto pr-2">
                {player.inventory.map((item, idx) => (
                    <li key={idx} className="flex justify-between items-center group bg-amber-950/20 p-2 border border-amber-900/30 hover:border-amber-600/50 transition-colors rounded-sm">
                        <span className="text-amber-200 text-lg tracking-wide truncate mr-2">{item}</span>
                        <button 
                            onClick={() => onUseItem(item)}
                            className="text-sm font-bold border border-amber-700 bg-amber-900/40 px-2 py-1 text-amber-500 hover:bg-amber-600 hover:text-black transition-all uppercase flex-shrink-0"
                        >
                            USE
                        </button>
                    </li>
                ))}
            </ul>
        )}
      </div>
    </div>
  );
};
    