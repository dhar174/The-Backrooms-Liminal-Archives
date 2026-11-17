import React from 'react';
import { EntityType } from '../types';

interface EncounterOverlayProps {
  entityName: string;
  onFlee: () => void;
  onConfront: () => void;
  onFlashlight: () => void;
  feedback: string | null;
  hasFlashlight: boolean;
}

export const EncounterOverlay: React.FC<EncounterOverlayProps> = ({ entityName, onFlee, onConfront, onFlashlight, feedback, hasFlashlight }) => {
  
  // Determine if flashlight is effective
  const canUseLight = hasFlashlight && (entityName.includes('Smiler') || entityName.includes('Hound'));

  return (
    <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300 border-t border-red-900/50">
      <div className="border-2 border-red-600/50 p-6 bg-red-950/20 max-w-lg w-full text-center shadow-[0_0_50px_rgba(220,38,38,0.2)]">
        <h2 className="text-red-500 text-4xl md:text-5xl font-vt323 mb-2 animate-pulse tracking-widest">⚠ WARNING ⚠</h2>
        
        <p className="text-amber-100 text-xl md:text-2xl font-vt323 mb-4 leading-relaxed">
          A <span className="text-red-500 font-bold uppercase">{entityName}</span> has manifested.
        </p>

        {feedback && (
            <div className="mb-6 bg-red-950/80 border border-red-500 text-red-200 px-4 py-2 font-bold animate-pulse text-xl shadow-[0_0_20px_rgba(255,0,0,0.5)]">
                {feedback}
            </div>
        )}
        
        <div className="grid grid-cols-2 gap-4 w-full">
          {canUseLight && (
            <button 
                onClick={onFlashlight}
                className="col-span-2 group relative bg-cyan-950/40 border border-cyan-400 hover:bg-cyan-900/60 text-cyan-100 py-4 px-2 font-vt323 text-2xl uppercase tracking-widest transition-all active:scale-95 mb-2 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            >
                <span className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"/>
                <span className="relative flex items-center justify-center gap-2">
                    🔦 BANISH WITH LIGHT
                </span>
                <span className="block text-sm text-cyan-400/70 normal-case mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Entity Weakness Detected
                </span>
            </button>
          )}

          <button 
            onClick={onFlee}
            className="group relative bg-amber-950/40 border border-amber-600 hover:bg-amber-900/60 text-amber-100 py-4 px-2 font-vt323 text-2xl uppercase tracking-widest transition-all active:scale-95"
          >
            <span className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity"/>
            <span className="relative">FLEE</span>
            <span className="block text-sm text-amber-500/70 normal-case mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                Roll Evasion
            </span>
          </button>
          
          <button 
            onClick={onConfront}
            className="group relative bg-red-950/40 border border-red-600 hover:bg-red-900/60 text-red-100 py-4 px-2 font-vt323 text-2xl uppercase tracking-widest transition-all active:scale-95"
          >
            <span className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"/>
            <span className="relative">CONFRONT</span>
            <span className="block text-red-400/70 normal-case mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                High Danger
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};