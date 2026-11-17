import React from 'react';

interface EffectsOverlayProps {
  sanity: number;
  isDamaged: boolean;
  isHealed: boolean;
  encounterFlash: string | null;
  isCameraFlash: boolean;
  isFlashlightOn: boolean;
}

export const EffectsOverlay: React.FC<EffectsOverlayProps> = ({ 
  sanity, 
  isDamaged, 
  isHealed, 
  encounterFlash, 
  isCameraFlash,
  isFlashlightOn 
}) => {
  // Calculate opacity of hallucinations/noise based on sanity
  const noiseOpacity = Math.max(0.05, (100 - sanity) / 200);
  
  // Render entity specific visuals
  const renderEntityVisual = () => {
    if (!encounterFlash) return null;
    const type = encounterFlash.toLowerCase();

    // Smiler: Glowing Eyes and Smile
    if (type.includes('smiler')) {
        return (
            <div className="absolute inset-0 z-[100] bg-black/90 flex items-center justify-center animate-in fade-in duration-75">
                <div className="relative transform scale-75 md:scale-100">
                    <div className="flex gap-32 mb-12 justify-center">
                        <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_40px_white] animate-pulse" />
                        <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_40px_white] animate-pulse" />
                    </div>
                    <div className="w-96 h-32 border-b-[8px] border-white rounded-[100%] shadow-[0_20px_50px_rgba(255,255,255,0.8)]" />
                </div>
            </div>
        );
    }

    // Partygoer: Distorted Smiley Face =)
    if (type.includes('partygoer')) {
        return (
             <div className="absolute inset-0 z-[100] bg-yellow-900/50 flex items-center justify-center mix-blend-color-dodge overflow-hidden">
                <div className="text-yellow-500 font-mono text-[150px] md:text-[300px] font-bold animate-bounce opacity-80 rotate-90 scale-y-150 tracking-tighter">
                    =)
                </div>
            </div>
        );
    }
    
    // Hound: Scratch Marks / Blur
    if (type.includes('hound')) {
        return (
             <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="w-full h-full relative opacity-70">
                    <div className="absolute top-1/4 left-1/4 w-96 h-2 bg-red-900 rotate-45 transform skew-x-12 blur-sm" />
                    <div className="absolute top-1/3 left-1/3 w-96 h-2 bg-red-900 rotate-45 transform skew-x-12 blur-sm" />
                    <div className="absolute top-1/2 left-1/4 w-96 h-2 bg-red-900 rotate-45 transform skew-x-12 blur-sm" />
                </div>
                <div className="absolute inset-0 bg-red-900/20 mix-blend-multiply animate-pulse" />
            </div>
        );
    }

    // Default: Glitchy Silhouette for unknown entities
    return (
        <div className="absolute inset-0 z-[100] bg-black/70 flex items-center justify-center">
             <div className="w-64 h-96 bg-black blur-2xl animate-pulse shadow-[0_0_100px_rgba(50,0,0,1)]" />
        </div>
    );
  };
  
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden h-full w-full">
      {/* Scanlines */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] pointer-events-none" />
      
      {/* Moving Scanline Bar */}
      <div className="scanline" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.6)_100%)]" />

      {/* Flashlight Beam Overlay */}
      {isFlashlightOn && (
        <div className="absolute inset-0 z-30 pointer-events-none mix-blend-screen opacity-60">
           <div className="absolute top-1/2 left-1/2 w-[180vmax] h-[180vmax] -translate-x-1/2 -translate-y-1/2 animate-flashlight-sway">
              <div className="w-full h-full bg-[radial-gradient(circle_at_center,rgba(255,250,220,0.15)_0%,rgba(255,255,255,0)_35%)] crt-flicker" />
           </div>
        </div>
      )}

      {/* Sanity Noise - Static increases as sanity drops */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='${noiseOpacity}'/%3E%3C/svg%3E")`,
            opacity: noiseOpacity,
        }} 
      />

      {/* Damage Red Flash */}
      {isDamaged && (
        <div className="absolute inset-0 bg-red-900/30 animate-pulse" />
      )}

      {/* Healing Blue/Gold Flash */}
      {isHealed && (
        <div className="absolute inset-0 bg-cyan-500/20 mix-blend-screen animate-[pulse_1s_ease-in-out]" />
      )}

      {/* Camera Flash */}
      {isCameraFlash && (
        <div className="absolute inset-0 bg-white z-[150] animate-out fade-out duration-1000" />
      )}

      {/* CRT Curvature (simulated via border) */}
      <div className="absolute inset-0 border-[1px] border-white/5 rounded-lg" />

      {/* Entity Encounter Visual Flash */}
      {renderEntityVisual()}
    </div>
  );
};