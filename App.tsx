import React, { useState, useEffect } from 'react';
import { PlayerState, LocationState, GameLevel, LogEntry, ItemType, GameContext, EntityType, GameResponseSchema, WorldNode } from './types';
import { INITIAL_HEALTH, INITIAL_SANITY } from './constants';
import { generateGameTurn } from './services/geminiService';
import { initAudio, playMoveSound, updateAmbience, updateEntitySoundscape } from './services/audioService';
import { Terminal } from './components/Terminal';
import { StatusPanel } from './components/StatusPanel';
import { Controls } from './components/Controls';
import { EffectsOverlay } from './components/EffectsOverlay';
import { EncounterOverlay } from './components/EncounterOverlay';

const App: React.FC = () => {
  // --- State ---
  const [player, setPlayer] = useState<PlayerState>({
    sanity: INITIAL_SANITY,
    health: INITIAL_HEALTH,
    inventory: [ItemType.AlmondWater],
    hasFlashlightOn: false,
  });

  const [location, setLocation] = useState<LocationState>({
    x: 0,
    y: 0,
    level: GameLevel.Lobby,
  });
  const [prevLocation, setPrevLocation] = useState<LocationState | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDamaged, setIsDamaged] = useState(false);
  const [isHealed, setIsHealed] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [visualVibe, setVisualVibe] = useState("Mono-yellow damp carpet");
  
  // Track active entity encounter
  const [currentEncounter, setCurrentEncounter] = useState<string | null>(null);
  const [combatFeedback, setCombatFeedback] = useState<string | null>(null);
  const [flashEntity, setFlashEntity] = useState<string | null>(null);
  const [cameraFlash, setCameraFlash] = useState(false);
  
  // Global Time
  const [turnCount, setTurnCount] = useState(0);

  // Narrative History (Last 10 turns)
  const [recentNarratives, setRecentNarratives] = useState<string[]>([]);

  // World Graph (Master Store)
  const [worldGraph, setWorldGraph] = useState<Record<string, WorldNode>>({});

  // --- Helpers ---
  const addLog = (text: string, type: LogEntry['type'] = 'narrative') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      type,
      timestamp: Date.now(),
    };
    setLogs((prev) => [...prev, newLog]);
  };

  const updateNarrativeHistory = (narrative: string) => {
    setRecentNarratives(prev => {
        const updated = [...prev, narrative];
        if (updated.length > 20) {
            return updated.slice(updated.length - 20);
        }
        return updated;
    });
  };

  // Roll for entity presence in a single node
  const rollEntityForNode = (level: GameLevel, x: number, y: number): EntityType | null => {
     if (x === 0 && y === 0 && level === GameLevel.Lobby) return null; // Safe start

    const baseChance = 0.15; 
    if (Math.random() < baseChance) {
        const rand = Math.random();
        if (level === GameLevel.Lobby) {
            return rand > 0.8 ? EntityType.Smiler : EntityType.Hound;
        } else if (level === GameLevel.HabitableZone) {
            return rand > 0.7 ? EntityType.SkinStealer : EntityType.Hound;
        } else if (level === GameLevel.PipeDreams) {
            return rand > 0.6 ? EntityType.Smiler : EntityType.SkinStealer;
        }
        return EntityType.Hound;
    }
    return null;
  };

  // Roll for Loot presence in a single node
  const rollLootForNode = (level: GameLevel, x: number, y: number): ItemType | null => {
    if (x === 0 && y === 0 && level === GameLevel.Lobby) return null; // Safe start

    // 15% Global Chance for loot
    if (Math.random() > 0.15) return null;

    const rand = Math.random();
    // 60% Water, 30% Flashlight, 10% Camera
    if (rand < 0.6) return ItemType.AlmondWater;
    if (rand < 0.9) return ItemType.Flashlight;
    return ItemType.Camera;
  };

  // Update Audio Soundscape based on neighborhood
  const updateAudioContext = (center: LocationState, graph: Record<string, WorldNode>, activeEncounter: string | null) => {
      const neighbors = [
          {x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0}
      ];
      
      const nearbyEntities: EntityType[] = [];
      
      neighbors.forEach(offset => {
          const key = `${center.level}:${center.x + offset.x}:${center.y + offset.y}`;
          const node = graph[key];
          if (node && node.entityType && node.entityType !== EntityType.None) {
              nearbyEntities.push(node.entityType);
          }
      });

      const activeType = activeEncounter ? activeEncounter as EntityType : null;
      updateEntitySoundscape(activeType, nearbyEntities);
  };

  // Pre-roll entities and loot for adjacent nodes
  const ensureNeighborhood = (center: LocationState, currentGraph: Record<string, WorldNode>): Record<string, WorldNode> => {
    const newGraph = { ...currentGraph };
    const offsets = [
        {x:0, y:0}, // Self
        {x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0} // Neighbors
    ];

    offsets.forEach(offset => {
        const tX = center.x + offset.x;
        const tY = center.y + offset.y;
        const key = `${center.level}:${tX}:${tY}`;

        if (!newGraph[key]) {
            // Create Shadow Node with pre-rolled Entity and Loot
            const entity = rollEntityForNode(center.level, tX, tY);
            const item = rollLootForNode(center.level, tX, tY);
            newGraph[key] = {
                data: null,
                visited: false,
                lastVisitTurn: turnCount,
                entityType: entity,
                itemType: item
            };
        }
    });
    return newGraph;
  };

  // --- Game Logic ---
  const handleGameTurn = async (action: string, overrideLocation?: LocationState, playerOverride?: PlayerState) => {
    if (player.health <= 0 || player.sanity <= 0) return;
    
    setIsLoading(true);
    const newTurnCount = turnCount + 1;
    setTurnCount(newTurnCount);

    const isLookAround = action === 'Look Around';
    const isCombat = action.includes('FLEE') || action.includes('CONFRONT') || action.includes('Panic ran') || action.includes('fought') || action.includes('Uses Flashlight against');
    const isItemAction = action.includes('Flashlight') || action.includes('Camera') || action.includes('Almond Water');
    
    let forcedEntity: string | null = null;
    let forcedLoot: ItemType | null = null;

    let currentLocation = overrideLocation || location;
    
    // Noclip Logic (Only when moving between rooms)
    let isNoclip = false;
    let nextGraph = worldGraph;
    let nextNarratives = recentNarratives;

    if (action.includes("Moved")) {
         // Probability Logic: 0.1% base, scales to 1.0% by turn 100.
         const baseProb = 0.001 + Math.min(0.009, turnCount * 0.00009); 
         let multiplier = 1;
         // Low stats increase probability significantly
         if (player.sanity < 30) multiplier += 2;
         if (player.health < 30) multiplier += 1.5;
         
         // Roll for Noclip
         if (Math.random() < (baseProb * multiplier)) {
             isNoclip = true;
             addLog("⚠ REALITY INTEGRITY FAILURE", "danger");
             addLog("You clipped through the world geometry...", "system");

             // Select Random Level (0, 1, or 2)
             const levels = [GameLevel.Lobby, GameLevel.HabitableZone, GameLevel.PipeDreams];
             const targetLevel = levels[Math.floor(Math.random() * levels.length)];
             
             // Random coordinates near origin to disorient but reset map scale
             currentLocation = { 
                 level: targetLevel, 
                 x: Math.floor(Math.random() * 6) - 3, 
                 y: Math.floor(Math.random() * 6) - 3 
             };
             
             // Reset State for new level
             nextGraph = {}; 
             nextNarratives = [];
             
             setLocation(currentLocation);
             setPrevLocation(null);
             setWorldGraph({});
             setRecentNarratives([]);
             // Execution continues, but using new location and empty graph/history
         }
    }

    // 1. Expand Graph (Pre-roll neighbors)
    // If Noclip happened, nextGraph is empty, so this builds the start of the new level.
    let currentGraph = ensureNeighborhood(currentLocation, nextGraph);
    setWorldGraph(currentGraph); 
    
    const nodeKey = `${currentLocation.level}:${currentLocation.x}:${currentLocation.y}`;
    let currentNode = currentGraph[nodeKey];

    // Collect nearby entities
    const nearbyEntities: EntityType[] = [];
    [ {x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0} ].forEach(off => {
         const k = `${currentLocation.level}:${currentLocation.x + off.x}:${currentLocation.y + off.y}`;
         const n = currentGraph[k];
         if (n && n.entityType && n.entityType !== EntityType.None) nearbyEntities.push(n.entityType);
    });

    // 2. Determine Encounter & Loot
    // We do NOT trigger standard encounters on the turn we Noclip to give the player a breather/narrative focus.
    const shouldCheckEncounter = !currentEncounter && !isCombat && !isItemAction && !isNoclip;

    if (shouldCheckEncounter) {
        if (currentNode && !currentNode.visited && currentNode.entityType && currentNode.entityType !== EntityType.None) {
            forcedEntity = currentNode.entityType;
        } 
        else if (currentNode && currentNode.visited && currentNode.entityType && currentNode.entityType !== EntityType.None) {
            const turnsPassed = newTurnCount - currentNode.lastVisitTurn;
            const chanceGone = Math.min(1, turnsPassed * 0.15);
            if (Math.random() >= chanceGone) {
                forcedEntity = currentNode.entityType;
            }
        }
    }

    // Loot Detection Logic
    // Only look for loot if we aren't fighting a monster
    if (!forcedEntity && !isCombat && currentNode && currentNode.itemType && !isNoclip) {
        const item = currentNode.itemType;
        // Detection chance: 100% if Look Around or Flashlight is ON. 40% otherwise.
        const detectionChance = (isLookAround || player.hasFlashlightOn || isItemAction) ? 1.0 : 0.4;
        
        if (Math.random() < detectionChance) {
            forcedLoot = item;
            // Pre-emptive Duplicate Swap for Unique Items
            if ((forcedLoot === ItemType.Flashlight || forcedLoot === ItemType.Camera) && player.inventory.includes(forcedLoot)) {
                forcedLoot = ItemType.AlmondWater; 
            }
        }
    }

    let result: GameResponseSchema | null = null;
    let reusedFromCache = false;

    // Apply Passive Sanity Effects (calculated before passing to Gemini so context is accurate)
    let currentSanity = playerOverride?.sanity ?? player.sanity;
    let passiveSanityChange = 0;
    
    // Flashlight ON: +1 Sanity boost
    if (player.hasFlashlightOn) {
        passiveSanityChange += 1;
    } 
    // Flashlight OFF in Dark Levels (Not Lobby): -1 Sanity drain (Slight)
    else if (currentLocation.level !== GameLevel.Lobby) {
        passiveSanityChange -= 1;
    }

    // Apply passive change to temporary local var (committed later)
    currentSanity = Math.max(0, Math.min(100, currentSanity + passiveSanityChange));

    const context: GameContext = {
        player: { ...(playerOverride || player), sanity: currentSanity },
        location: currentLocation,
        lastAction: action
    };

    // Retrieve Hidden Detail if available for Flashlight/Inspection
    const hiddenDetail = currentNode?.data?.hiddenDetail || null;

    // 3. Generate Content
    if (isNoclip) {
        // NOCLIP GENERATION
         result = await generateGameTurn(context, nextNarratives, {
            isNoclip: true,
            // We pass hiddenDetail if lucky enough to generate one, though node is unvisited
            hiddenDetail: null 
         });
    }
    else if (forcedEntity && !currentNode.visited) {
        // NEW ENCOUNTER
        result = await generateGameTurn(context, recentNarratives, {
            forceEncounter: forcedEntity,
            existingRoomNarrative: null,
            hiddenDetail
        });
    } 
    else if (currentNode && currentNode.visited && !isLookAround && !isCombat && !isItemAction && !forcedLoot) {
        // VISITED NODE (Standard Revisit, no new events)
        if (currentNode.entityType && currentNode.entityType !== EntityType.None) {
             if (forcedEntity) {
                 result = await generateGameTurn(context, recentNarratives, {
                    existingRoomNarrative: currentNode.data?.narrative || null,
                    entityPersistence: 'still_here',
                    hiddenDetail
                 });
             } else {
                 result = await generateGameTurn(context, recentNarratives, {
                    existingRoomNarrative: currentNode.data?.narrative || null,
                    entityPersistence: 'gone',
                    hiddenDetail
                 });
             }
        } else {
            // Totally clean node
            result = { ...currentNode.data! };
            reusedFromCache = true;
            if (result.event === 'item_found' || result.event === 'level_transport') {
                result.event = 'none';
                result.eventDetail = '';
            }
        }
    }
    else {
        // GENERIC or ACTION or LOOT FOUND
        result = await generateGameTurn(context, recentNarratives, {
            isLookAround: isLookAround,
            existingRoomNarrative: currentNode?.data?.narrative || null,
            nearbyEntities: nearbyEntities,
            foundItem: forcedLoot,
            hiddenDetail,
            activeEncounterType: currentEncounter
        });
    }

    setIsLoading(false);

    if (!result) {
        addLog("The reality glitches... (Connection Failed)", "system");
        return;
    }

    addLog(result.narrative, 'narrative');
    if (!reusedFromCache) updateNarrativeHistory(result.narrative);

    // Update Node Data
    let finalEntityType = currentNode?.entityType || EntityType.None;
    if (result.event === 'entity_encounter') {
        finalEntityType = result.eventDetail as EntityType;
        setCurrentEncounter(result.eventDetail);
        setFlashEntity(result.eventDetail);
        setTimeout(() => setFlashEntity(null), 2000);
    } else if (result.event === 'none' && currentNode?.visited && currentNode.entityType) {
         // If we had an entity but the event is now 'none', it means it's gone/defeated/fled
         // UNLESS we just drank water or something unrelated.
         // For combat turns specifically:
         if (isCombat) {
             finalEntityType = EntityType.None;
         }
    }

    // Handle Item Pickup (Graph update)
    // If item was found, we remove it from the node so it can't be found again
    const remainingItem = (result.event === 'item_found') ? null : (currentNode?.itemType || null);

    // Persist Hidden Detail
    if (!result.hiddenDetail && currentNode?.data?.hiddenDetail) {
        result.hiddenDetail = currentNode.data.hiddenDetail;
    }

    const updatedGraph = {
        ...currentGraph,
        [nodeKey]: {
            data: result,
            visited: true,
            lastVisitTurn: newTurnCount,
            entityType: finalEntityType,
            itemType: remainingItem
        }
    };
    setWorldGraph(updatedGraph);

    updateAudioContext(currentLocation, updatedGraph, result.event === 'entity_encounter' ? result.eventDetail : null);
    if (result.visualDescription) setVisualVibe(result.visualDescription);

    // Stats (Apply Gemini changes + Passive changes)
    // Note: We applied passive changes to the context sent to Gemini, but we haven't committed them to state yet.
    // We should commit the BASE passive change + Gemini's delta.
    const totalSanityChange = result.sanityChange + passiveSanityChange;
    
    if (totalSanityChange !== 0) {
        setPlayer(p => ({ ...p, sanity: Math.max(0, Math.min(100, p.sanity + totalSanityChange)) }));
        if (totalSanityChange < 0) addLog(`Sanity ${totalSanityChange}`, "danger");
        else if (passiveSanityChange > 0 && result.sanityChange === 0) {
            // Minimal feedback for passive boost so it doesn't spam
            // addLog("The light calms you.", "system"); 
        }
    }

    if (result.healthChange !== 0) {
        setPlayer(p => ({ ...p, health: Math.max(0, Math.min(100, p.health + result!.healthChange)) }));
        if (result.healthChange < 0) {
            addLog(`Health ${result.healthChange}`, "danger");
            triggerDamageEffect();
        }
    }

    // Items & Level
    if (result.event === 'item_found' && !reusedFromCache) {
         const itemMap: Record<string, ItemType> = { 'Almond Water': ItemType.AlmondWater, 'Flashlight': ItemType.Flashlight, 'Camera': ItemType.Camera };
         let foundItem = ItemType.AlmondWater;
         
         if (result.eventDetail.includes('Flashlight')) foundItem = ItemType.Flashlight;
         else if (result.eventDetail.includes('Camera')) foundItem = ItemType.Camera;
         
         // Double check duplicate logic
         if ((foundItem === ItemType.Flashlight || foundItem === ItemType.Camera) && player.inventory.includes(foundItem)) {
             addLog(`You found another ${foundItem}, but you decide to take the Almond Water nearby instead.`, 'system');
             foundItem = ItemType.AlmondWater;
         }

         setPlayer(p => ({ ...p, inventory: [...p.inventory, foundItem] }));
         addLog(`You found: ${foundItem}`, 'item');
    }
    if (result.event === 'level_transport') {
        addLog("The floor gives way... You've clipped through.", "system");
        const nextLevel = (currentLocation.level + 1) % 3;
        const startLoc = { level: nextLevel, x: 0, y: 0 };
        setLocation(startLoc); 
        setPrevLocation(null);
        setRecentNarratives([]); 
        setWorldGraph({}); 
    }
  };

  const triggerDamageEffect = () => {
    setIsDamaged(true);
    setTimeout(() => setIsDamaged(false), 500);
  };

  const triggerHealEffect = () => {
    setIsHealed(true);
    setTimeout(() => setIsHealed(false), 1000);
  };

  const triggerCameraFlash = () => {
    setCameraFlash(true);
    setTimeout(() => setCameraFlash(false), 200); 
  };

  // --- Handlers ---
  const onMove = (direction: string) => {
    playMoveSound();
    let dx = 0, dy = 0;
    if (direction === 'North') dy = 1;
    if (direction === 'South') dy = -1;
    if (direction === 'East') dx = 1;
    if (direction === 'West') dx = -1;

    setPrevLocation(location);
    const newLocation = { ...location, x: location.x + dx, y: location.y + dy };
    setLocation(newLocation);
    handleGameTurn(`Moved ${direction}`, newLocation);
  };

  const onAction = (action: string) => {
    if (action === 'Toggle Flashlight') {
        if (player.inventory.includes(ItemType.Flashlight)) {
            // Pass logic through onUseItem to centralize
            onUseItem(ItemType.Flashlight);
        }
        return;
    }
    if (action === 'Look Around') {
        handleGameTurn('Look Around', location);
        return;
    }
    handleGameTurn(action, location);
  };

  const onUseItem = (item: ItemType) => {
    if (item === ItemType.AlmondWater) {
        // Calculate new state immediately for UI feedback
        const newInventory = [...player.inventory];
        const idx = newInventory.indexOf(item);
        if (idx > -1) newInventory.splice(idx, 1);
        
        const newSanity = Math.min(100, player.sanity + 15);
        const newHealth = Math.min(100, player.health + 10);

        const updatedPlayer = { 
            ...player, 
            sanity: newSanity, 
            health: newHealth, 
            inventory: newInventory 
        };
        
        setPlayer(updatedPlayer);
        triggerHealEffect();
        
        // Send event to Gemini for narrative description
        handleGameTurn("Drank Almond Water", location, updatedPlayer);
    }
    else if (item === ItemType.Flashlight) {
        const newFlashlightState = !player.hasFlashlightOn;
        const updatedPlayer = { ...player, hasFlashlightOn: newFlashlightState };
        setPlayer(updatedPlayer);
        
        // Check for specific interaction with active encounter
        if (currentEncounter && (currentEncounter.includes('Smiler') || currentEncounter.includes('Hound')) && newFlashlightState) {
             addLog("FLASHLIGHT FOCUSED!", "item");
             setCurrentEncounter(null); // Optimistic update
             handleGameTurn(`Uses Flashlight against ${currentEncounter}`, location, updatedPlayer);
             return;
        }

        if (newFlashlightState) {
             addLog("Flashlight clicked ON.", "system");
             handleGameTurn("Shines Flashlight into the darkness", location, updatedPlayer);
        } else {
             addLog("Flashlight clicked OFF.", "system");
             handleGameTurn("Clicks Flashlight OFF", location, updatedPlayer);
        }
    }
    else if (item === ItemType.Camera) {
        triggerCameraFlash();
        addLog("FLASH! You take a photo.", "system");
        handleGameTurn("Takes a photo with Flash", location);
    }
  };

  const handleEncounterDecision = (decision: 'Flee' | 'Confront' | 'Flashlight') => {
    if (!currentEncounter) return;
    const entity = currentEncounter;
    
    if (decision === 'Flashlight') {
        // Trigger Flashlight Combat Logic
        // We force the flashlight state to ON if it isn't already, or just describe focusing it
        const updatedPlayer = { ...player, hasFlashlightOn: true };
        setPlayer(updatedPlayer);
        
        setCurrentEncounter(null);
        setCombatFeedback(null);
        addLog(`You shine the light directly at the ${entity}!`, 'item');
        
        // Clear entity from graph explicitly to be safe
        const key = `${location.level}:${location.x}:${location.y}`;
        if (worldGraph[key]) {
             const safeGraph = { ...worldGraph };
             safeGraph[key] = { ...safeGraph[key], entityType: EntityType.None };
             setWorldGraph(safeGraph);
        }

        handleGameTurn(`Uses Flashlight against ${entity}`, location, updatedPlayer);

    } else if (decision === 'Flee') {
        const evadeChance = 0.5; 
        const success = Math.random() < evadeChance;
        
        if (success) {
            const dirs = ['North', 'South', 'East', 'West'];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            let dx = 0, dy = 0;
            if (dir === 'North') dy = 1;
            if (dir === 'South') dy = -1;
            if (dir === 'East') dx = 1;
            if (dir === 'West') dx = -1;
            
            setPrevLocation(location);
            const newLocation = { ...location, x: location.x + dx, y: location.y + dy };
            setLocation(newLocation);
            playMoveSound();
            
            setCurrentEncounter(null);
            setCombatFeedback(null);
            addLog(`You scrambled ${dir} to escape!`, 'system');
            
            // Clear entity from successful flee destination if any (race condition safety)
            const key = `${newLocation.level}:${newLocation.x}:${newLocation.y}`;
            if (worldGraph[key]) {
                 const safeGraph = { ...worldGraph };
                 safeGraph[key] = { ...safeGraph[key], entityType: EntityType.None };
                 setWorldGraph(safeGraph);
            }

            handleGameTurn(`Panic ran ${dir} to escape the ${entity}`, newLocation);
        } else {
            setCombatFeedback("ESCAPE FAILED - IT BLOCKED YOU!");
            handleGameTurn(`Tried to FLEE from the ${entity} but FAILED`, location);
        }
    } else {
        setCombatFeedback(null);
        handleGameTurn(`Stood ground and CONFRONTED the ${entity}`, location);
    }
  };

  // --- Initial Load ---
  useEffect(() => {
    if (!gameStarted) {
        addLog("Welcome to the Liminal Archives.", "system");
        addLog("Ensure your API Key is set.", "system");
    }
  }, []);

  useEffect(() => {
    if (gameStarted) updateAmbience(location.level);
  }, [gameStarted, location.level]);

  const startGame = () => {
    initAudio(); 
    setGameStarted(true);
    handleGameTurn("Wake up", location);
  };

  if (!gameStarted) {
    return (
        <div className="h-screen w-screen bg-black flex items-center justify-center font-vt323 relative overflow-hidden">
            <EffectsOverlay sanity={100} isDamaged={false} isHealed={false} encounterFlash={null} isCameraFlash={false} isFlashlightOn={false} />
            <div className="z-10 text-center p-8 border border-amber-600/30 bg-black/80 max-w-lg">
                <h1 className="text-6xl text-amber-500 mb-4 animate-pulse">THE BACKROOMS</h1>
                <p className="text-amber-300 text-xl mb-8">"If you're not careful and you noclip out of reality..."</p>
                <button onClick={startGame} className="bg-amber-600 text-black px-8 py-3 text-2xl hover:bg-amber-500 transition-colors animate-bounce">ENTER REALITY</button>
            </div>
        </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-neutral-900 flex flex-col md:flex-row overflow-hidden relative">
      <EffectsOverlay 
        sanity={player.sanity} 
        isDamaged={isDamaged} 
        isHealed={isHealed} 
        encounterFlash={flashEntity} 
        isCameraFlash={cameraFlash}
        isFlashlightOn={player.hasFlashlightOn && (location.level === GameLevel.Lobby || location.level === GameLevel.PipeDreams)}
      />
      <div className="absolute inset-0 opacity-10 pointer-events-none transition-colors duration-[2000ms]" style={{ backgroundColor: visualVibe.toLowerCase().includes('red') ? '#7f1d1d' : visualVibe.toLowerCase().includes('dark') ? '#000000' : '#f59e0b' }} />
      
      <div className="flex-1 flex flex-col z-10 h-full relative">
        <Terminal logs={logs} isLoading={isLoading} />
        <div className="p-2 bg-black/90 border-t border-amber-900/30 relative min-h-[200px] flex items-center justify-center">
            {currentEncounter ? (
                <EncounterOverlay 
                    entityName={currentEncounter} 
                    onFlee={() => handleEncounterDecision('Flee')} 
                    onConfront={() => handleEncounterDecision('Confront')} 
                    onFlashlight={() => handleEncounterDecision('Flashlight')}
                    feedback={combatFeedback} 
                    hasFlashlight={player.inventory.includes(ItemType.Flashlight)}
                />
            ) : (
                <Controls onMove={onMove} onAction={onAction} disabled={isLoading || player.health <= 0} hasFlashlight={player.inventory.includes(ItemType.Flashlight)} isFlashlightOn={player.hasFlashlightOn} />
            )}
        </div>
      </div>
      <div className="z-20 md:h-full">
        <StatusPanel player={player} level={location.level} currentLocation={location} prevLocation={prevLocation} worldGraph={worldGraph} onUseItem={onUseItem} />
      </div>
    </div>
  );
};

export default App;