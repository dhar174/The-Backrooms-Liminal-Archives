
import React from 'react';
import { LocationState, WorldNode, GameLevel, EntityType } from '../types';

interface MinimapProps {
  currentLocation: LocationState;
  prevLocation: LocationState | null;
  worldGraph: Record<string, WorldNode>;
  level: GameLevel;
}

// SVG Icons - Increased Contrast and Stroke Weights

const SmilerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-full h-full animate-pulse drop-shadow-[0_0_3px_white] p-1">
    <circle cx="8" cy="9" r="2" fill="white" />
    <circle cx="16" cy="9" r="2" fill="white" />
    <path d="M6 15 C8 19, 16 19, 18 15" stroke="white" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const HoundIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-full h-full drop-shadow-[0_0_3px_red] p-1">
    <path d="M4 8 L8 18 L12 14 L16 18 L20 8" stroke="#ef4444" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M2 8 Q12 -2 22 8" stroke="#ef4444" strokeWidth="2" strokeDasharray="2 2" />
  </svg>
);

const PartygoerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-full h-full drop-shadow-[0_0_3px_yellow] p-1">
    <circle cx="12" cy="12" r="9" stroke="#facc15" strokeWidth="2.5" />
    <path d="M8 10 L10 10 M14 10 L16 10" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M12 15 L16 12" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M8 12 L12 15" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const SkinStealerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-full h-full drop-shadow-[0_0_3px_pink] p-1">
    <path d="M12 2 C12 2 5 5 5 12 C5 19 12 22 12 22 C12 22 19 19 19 12 C19 5 12 2 12 2 Z" stroke="#db2777" strokeWidth="2.5" />
    <circle cx="9" cy="10" r="1" fill="#db2777" />
    <circle cx="15" cy="10" r="1" fill="#db2777" />
    <path d="M10 16 L14 16" stroke="#db2777" strokeWidth="2.5" />
  </svg>
);

const WarningIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-full h-full animate-bounce p-1">
    <path d="M12 4 L20 20 H4 L12 4 Z" stroke="#ef4444" strokeWidth="2.5" />
    <path d="M12 10 V14" stroke="#ef4444" strokeWidth="2.5" />
    <circle cx="12" cy="17" r="1" fill="#ef4444" />
  </svg>
);

const PlayerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-full h-full animate-pulse drop-shadow-[0_0_5px_#fbbf24] p-1">
    <circle cx="12" cy="12" r="6" fill="#fbbf24" />
    <circle cx="12" cy="12" r="10" stroke="#fbbf24" strokeWidth="2.5" opacity="0.6" />
  </svg>
);

const PreviousIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full opacity-80 p-0.5">
        <path d="M12 12 m-6 0 a 6 6 0 1 0 12 0 a 6 6 0 1 0 -12 0" stroke="#d97706" strokeWidth="2.5" strokeDasharray="3 3" />
    </svg>
);


export const Minimap: React.FC<MinimapProps> = ({ currentLocation, prevLocation, worldGraph, level }) => {
  const RANGE = 2; // 5x5 Grid
  
  // Generate Grid Cells
  const cells = [];
  for (let y = currentLocation.y + RANGE; y >= currentLocation.y - RANGE; y--) {
    for (let x = currentLocation.x - RANGE; x <= currentLocation.x + RANGE; x++) {
      cells.push({ x, y });
    }
  }

  const renderCellContent = (node: WorldNode | undefined, isPlayer: boolean, isPrev: boolean) => {
    if (isPlayer) return <PlayerIcon />;
    
    if (node && node.visited && node.entityType && node.entityType !== EntityType.None) {
         switch (node.entityType) {
            case EntityType.Smiler: return <SmilerIcon />;
            case EntityType.Hound: return <HoundIcon />;
            case EntityType.Partygoer: return <PartygoerIcon />;
            case EntityType.SkinStealer: return <SkinStealerIcon />;
            default: return <WarningIcon />;
         }
    }
    
    if (isPrev) return <PreviousIcon />;

    // Event icons for items/transport if visited and no entity
    if (node && node.visited) {
        if (node.data?.event === 'item_found') return <span className="text-cyan-400 font-bold text-2xl drop-shadow-[0_0_5px_cyan]">?</span>;
        if (node.data?.event === 'level_transport') return <span className="text-purple-500 font-bold text-2xl drop-shadow-[0_0_5px_purple]">#</span>;
    }

    return null;
  };

  return (
    <div className="flex flex-col w-full aspect-square bg-black border-2 border-amber-900/60 p-1 relative overflow-hidden shadow-inner rounded-sm">
        {/* CRT Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none z-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.2)_50%),linear-gradient(90deg,rgba(255,0,0,0.05),rgba(0,255,0,0.02),rgba(0,0,255,0.05))] bg-[length:100%_4px,4px_100%]"></div>

        <div className="grid grid-cols-5 grid-rows-5 gap-0.5 h-full w-full z-10 bg-amber-950/10">
            {cells.map((cell) => {
                const isPlayer = cell.x === currentLocation.x && cell.y === currentLocation.y;
                const isPrev = prevLocation && cell.x === prevLocation.x && cell.y === prevLocation.y && prevLocation.level === level;
                
                const key = `${level}:${cell.x}:${cell.y}`;
                const node = worldGraph[key];
                const isVisited = node && node.visited;

                let bgClass = "bg-neutral-900/80"; // Fog darker
                let borderClass = "border-neutral-800/30";

                if (isVisited) {
                    bgClass = "bg-amber-900/20";
                    borderClass = "border-amber-800/30";
                    if (node.entityType && node.entityType !== EntityType.None) {
                         bgClass = "bg-red-950/30";
                         borderClass = "border-red-600/40 animate-pulse";
                    }
                }

                if (isPrev) {
                    borderClass = "border-amber-600/70 border-dashed";
                    bgClass = "bg-amber-700/20";
                }

                if (isPlayer) {
                    bgClass = "bg-amber-900/50";
                    borderClass = "border-amber-500";
                }

                return (
                    <div 
                        key={`${cell.x}:${cell.y}`} 
                        className={`border ${borderClass} ${bgClass} flex items-center justify-center transition-all duration-300 relative`}
                    >
                        {renderCellContent(node, isPlayer, !!isPrev)}
                    </div>
                );
            })}
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] text-amber-700/80 font-mono tracking-wider z-30">RADAR.SYS.3.0</div>
    </div>
  );
};
