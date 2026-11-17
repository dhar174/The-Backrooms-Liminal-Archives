import React from 'react';

interface ControlsProps {
  onMove: (direction: string) => void;
  onAction: (action: string) => void;
  disabled: boolean;
  hasFlashlight: boolean;
  isFlashlightOn: boolean;
}

export const Controls: React.FC<ControlsProps> = ({ 
  onMove, 
  onAction, 
  disabled, 
  hasFlashlight, 
  isFlashlightOn 
}) => {
  
  const btnClass = "bg-amber-950/30 border border-amber-800/50 text-amber-400 hover:bg-amber-800/40 hover:text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 py-3 px-4 font-vt323 text-xl uppercase tracking-wider";

  return (
    <div className="grid grid-cols-3 gap-2 p-4 max-w-md mx-auto w-full">
        {/* Top Row */}
        <div />
        <button 
            className={btnClass} 
            onClick={() => onMove('North')} 
            disabled={disabled}
        >
            N
        </button>
        <div />

        {/* Middle Row */}
        <button 
            className={btnClass} 
            onClick={() => onMove('West')} 
            disabled={disabled}
        >
            W
        </button>
        <button 
            className={btnClass} 
            onClick={() => onAction('Look Around')} 
            disabled={disabled}
            title="Inspect Area"
        >
            👁️
        </button>
        <button 
            className={btnClass} 
            onClick={() => onMove('East')} 
            disabled={disabled}
        >
            E
        </button>

        {/* Bottom Row */}
        <div className="flex items-center justify-center">
            {hasFlashlight && (
                <button 
                    className={`${btnClass} rounded-full w-10 h-10 p-0 flex items-center justify-center ${isFlashlightOn ? 'bg-amber-400/20 border-amber-200' : ''}`}
                    onClick={() => onAction('Toggle Flashlight')}
                    disabled={disabled}
                    title="Toggle Flashlight"
                >
                    🔦
                </button>
            )}
        </div>
        <button 
            className={btnClass} 
            onClick={() => onMove('South')} 
            disabled={disabled}
        >
            S
        </button>
        <div />
    </div>
  );
};