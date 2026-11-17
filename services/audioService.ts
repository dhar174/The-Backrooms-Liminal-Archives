
import { Howl } from 'howler';
import { GameLevel, EntityType } from '../types';

const SAMPLE_RATE = 44100;

// --- Helper: WAV Encoding ---

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const encodeWAV = (samples: Float32Array): string => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF Chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  
  // fmt Chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  
  // data Chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write Samples
  for (let i = 0; i < samples.length; i++) {
    // Hard clip
    let s = Math.max(-1, Math.min(1, samples[i]));
    // Convert to 16-bit
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(44 + i * 2, s, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

// --- Helper: DSP Functions ---

// Pink Noise Generator (Paul Kellett's method) - smoother than white noise
const createPinkNoise = (length: number): Float32Array => {
  const output = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168981;
    output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    output[i] *= 0.11; // Normalize roughly
    b6 = white * 0.115926;
  }
  return output;
};

// Brown Noise (1/f^2) - Deep rumble
const createBrownNoise = (length: number): Float32Array => {
  const output = new Float32Array(length);
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    output[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = output[i];
    output[i] *= 3.5; 
  }
  return output;
};

// Low Pass Filter (Simple IIR)
const lowPassFilter = (input: Float32Array, cutoff: number): Float32Array => {
  const output = new Float32Array(input.length);
  let lastVal = 0;
  // Alpha approximation: 2 * PI * cutoff / sampleRate
  const alpha = (2 * Math.PI * cutoff) / SAMPLE_RATE;
  
  for (let i = 0; i < input.length; i++) {
    lastVal = lastVal + alpha * (input[i] - lastVal);
    output[i] = lastVal;
  }
  return output;
};

// --- Sound Generators ---

const generateCarpetStep = (isWet: boolean) => {
  const duration = 0.25;
  const length = Math.floor(SAMPLE_RATE * duration);
  const mix = new Float32Array(length);

  let noise = createPinkNoise(length);
  noise = lowPassFilter(noise, isWet ? 800 : 450);
  noise = lowPassFilter(noise, isWet ? 600 : 350);

  const impact = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const freq = 100 * Math.exp(-t * 25);
    const amp = Math.sin(2 * Math.PI * freq * t);
    impact[i] = amp;
  }

  for (let i = 0; i < length; i++) {
    const progress = i / length;
    let env = 0;
    if (progress < 0.05) env = progress / 0.05;
    else env = Math.pow(1 - ((progress - 0.05) / 0.95), 3);

    const noiseGain = isWet ? 1.5 : 1.2;
    const impactGain = 0.6;
    
    mix[i] = (noise[i] * noiseGain + impact[i] * impactGain) * env;
    
    if (isWet && progress > 0.1) {
       mix[i] += (Math.random() * 0.05) * env; 
    }
  }
  return encodeWAV(mix);
};

// --- Entity Sound Generators ---

const generateSmilerSound = (isMuffled: boolean = false) => {
    // High pitched electrical whine + chitter
    const duration = 2.0;
    const length = Math.floor(SAMPLE_RATE * duration);
    let mix = new Float32Array(length);
    for(let i=0; i<length; i++) {
        const t = i / SAMPLE_RATE;
        const sine = Math.sin(2 * Math.PI * 3000 * t);
        const mod = Math.sin(2 * Math.PI * 15 * t); // Tremolo
        mix[i] = (sine * 0.05 * mod) + (Math.random() * 0.02);
    }
    if (isMuffled) mix = lowPassFilter(mix, 400);
    return encodeWAV(mix);
};

const generateHoundSound = (isMuffled: boolean = false) => {
    // Low, heavy breathing/growling
    const duration = 2.5;
    const length = Math.floor(SAMPLE_RATE * duration);
    let mix = new Float32Array(length);
    const brown = createBrownNoise(length);
    for(let i=0; i<length; i++) {
        const t = i / SAMPLE_RATE;
        const breath = Math.sin(2 * Math.PI * 0.4 * t); // Breath cycle
        const growl = Math.sin(2 * Math.PI * 60 * t) * 0.3; // Low growl
        mix[i] = (brown[i] * 0.5 + growl) * (breath > 0 ? breath : 0); // Only exhale
    }
    if (isMuffled) mix = lowPassFilter(mix, 350);
    return encodeWAV(mix);
};

const generateSkinStealerSound = (isMuffled: boolean = false) => {
    // Muffled, garbled speech-like structure
    const duration = 3.0;
    const length = Math.floor(SAMPLE_RATE * duration);
    let mix = new Float32Array(length);
    const pink = createPinkNoise(length);
    for(let i=0; i<length; i++) {
        const t = i / SAMPLE_RATE;
        // Formant-ish filtering via modulation
        const mod = (Math.sin(t * 10) + Math.sin(t * 23) + 1) / 3;
        mix[i] = pink[i] * mod * 0.8;
    }
    if (isMuffled) mix = lowPassFilter(mix, 450);
    return encodeWAV(mix);
};

const generatePartygoerSound = (isMuffled: boolean = false) => {
    // Distorted, happy-sounding but wrong. Squeaky.
    const duration = 2.0;
    const length = Math.floor(SAMPLE_RATE * duration);
    let mix = new Float32Array(length);
    for(let i=0; i<length; i++) {
        const t = i / SAMPLE_RATE;
        const sq = Math.sin(2 * Math.PI * 440 * t) > 0 ? 0.1 : -0.1; // Square wave
        const slide = Math.sin(2 * Math.PI * 2 * t);
        mix[i] = sq * slide * 0.2;
    }
    if (isMuffled) mix = lowPassFilter(mix, 400);
    return encodeWAV(mix);
};


// --- Ambience Generators ---

const generateLobbyHum = () => {
  const duration = 2.0;
  const length = Math.floor(SAMPLE_RATE * duration);
  const mix = new Float32Array(length);
  const pink = lowPassFilter(createPinkNoise(length), 300);

  for(let i=0; i<length; i++) {
    const t = i / SAMPLE_RATE;
    const mains = Math.sin(2 * Math.PI * 60 * t);
    const saw = ((t * 120) % 1) - 0.5;
    const whine = Math.sin(2 * Math.PI * 850 * t) * 0.05;
    const flicker = 1 + (Math.sin(2 * Math.PI * 0.2 * t) * 0.15);
    mix[i] = (pink[i] * 0.15) + (mains * 0.3) + (saw * 0.25 * flicker) + (whine * 0.05);
  }
  return encodeWAV(mix);
};

const generateIndustrialDrone = () => {
  const duration = 4.0;
  const length = Math.floor(SAMPLE_RATE * duration);
  const mix = new Float32Array(length);
  const pink = lowPassFilter(createPinkNoise(length), 800);
  for(let i=0; i<length; i++) {
    mix[i] = pink[i] * 0.6;
    if (Math.random() > 0.9995) mix[i] += (Math.random() * 0.3);
  }
  return encodeWAV(mix);
};

const generatePipeAmbience = () => {
  const duration = 3.0;
  const length = Math.floor(SAMPLE_RATE * duration);
  const mix = new Float32Array(length);
  const rumble = createBrownNoise(length);
  for(let i=0; i<length; i++) {
    const t = i / SAMPLE_RATE;
    const steam = (Math.random() * 2 - 1) * 0.05;
    const steamVol = 0.5 + Math.sin(2 * Math.PI * 0.2 * t) * 0.2;
    mix[i] = (rumble[i] * 0.8) + (steam * steamVol);
  }
  return encodeWAV(mix);
};

// --- Horror Event Generators ---

const generateSkitter = () => {
  const duration = 0.8;
  const length = Math.floor(SAMPLE_RATE * duration);
  const mix = new Float32Array(length);
  const noise = createPinkNoise(length); 
  
  for(let i=0; i<length; i++) {
    const scratchFreq = 15; 
    const t = i / SAMPLE_RATE;
    const cycle = (t * scratchFreq) % 1;
    let env = 0;
    if (cycle < 0.2) env = cycle * 5; 
    else env = Math.max(0, 1 - (cycle - 0.2) * 5);
    const val = (noise[i] - (i > 0 ? noise[i-1] : 0)) * 3;
    const rand = Math.sin(t * 999); 
    mix[i] = val * env * (0.3 + 0.7 * rand);
  }
  return encodeWAV(mix);
};

const generateWhisper = () => {
  const duration = 1.5;
  const length = Math.floor(SAMPLE_RATE * duration);
  const mix = new Float32Array(length);
  let noise = createPinkNoise(length);
  noise = lowPassFilter(noise, 1500); 
  for(let i=0; i<length; i++) {
    const t = i / SAMPLE_RATE;
    const mod = (Math.sin(t * 8) + Math.sin(t * 17) + 2) / 4;
    mix[i] = noise[i] * mod * 1.5;
  }
  return encodeWAV(mix);
};

// --- Service Interface ---

let stepSounds: Howl[] = [];
let currentAmbience: Howl | null = null;
let entityAmbience: Howl | null = null;
let currentEntityAmbienceType: string | null = null;
let currentLevel: GameLevel | null = null;
let eventTimeout: any = null;

export const initAudio = () => {
  if (stepSounds.length > 0) return;
  for (let i = 0; i < 3; i++) {
    stepSounds.push(new Howl({ src: [generateCarpetStep(false)], format: ['wav'], volume: 0.6 }));
  }
  stepSounds.push(new Howl({ src: [generateCarpetStep(true)], format: ['wav'], volume: 0.7 }));
  startEventLoop();
};

const startEventLoop = () => {
  if (eventTimeout) clearTimeout(eventTimeout);
  const delay = 15000 + Math.random() * 30000;
  eventTimeout = setTimeout(() => {
    playRandomEvent();
    startEventLoop();
  }, delay);
};

const playRandomEvent = () => {
  const r = Math.random();
  let url = "";
  let vol = 0.5;
  if (r < 0.6) {
    url = generateSkitter(); 
    vol = 0.4;
  } else {
    url = generateWhisper();
    vol = 0.6;
  }
  const sound = new Howl({
    src: [url],
    format: ['wav'],
    volume: vol,
    rate: 0.9 + Math.random() * 0.2
  });
  sound.stereo((Math.random() * 1.6) - 0.8);
  sound.play();
};

export const playMoveSound = () => {
  if (stepSounds.length === 0) initAudio();
  const idx = Math.floor(Math.random() * stepSounds.length);
  const sound = stepSounds[idx];
  const rate = 0.9 + Math.random() * 0.2;
  sound.rate(rate);
  sound.play();
};

export const updateAmbience = (level: GameLevel) => {
  if (level === currentLevel && currentAmbience?.playing()) return;
  
  currentLevel = level;
  let url = "";
  let volume = 0.4;

  if (level === GameLevel.Lobby) {
    url = generateLobbyHum();
    volume = 0.35;
  } else if (level === GameLevel.HabitableZone) {
    url = generateIndustrialDrone();
    volume = 0.5;
  } else if (level === GameLevel.PipeDreams) {
    url = generatePipeAmbience();
    volume = 0.4;
  }

  if (currentAmbience) {
    const old = currentAmbience;
    old.fade(old.volume(), 0, 2000);
    setTimeout(() => old.unload(), 2000);
  }

  const newAmbience = new Howl({
    src: [url],
    format: ['wav'],
    loop: true,
    volume: 0, 
    autoplay: true
  });
  newAmbience.fade(0, volume, 3000);
  currentAmbience = newAmbience;
};

export const updateEntitySoundscape = (activeEncounter: EntityType | null, nearbyEntities: EntityType[]) => {
    let targetType: EntityType | null = null;
    let targetVolume = 0;
    let isMuffled = false;

    // Logic: Active Encounter overrides everything. Otherwise, check nearby.
    if (activeEncounter && activeEncounter !== EntityType.None) {
        targetType = activeEncounter;
        targetVolume = 0.9; // Loud and distinct
        isMuffled = false;
    } else if (nearbyEntities.length > 0) {
        // Priority: Partygoer > Smiler > SkinStealer > Hound
        if (nearbyEntities.includes(EntityType.Partygoer)) targetType = EntityType.Partygoer;
        else if (nearbyEntities.includes(EntityType.Smiler)) targetType = EntityType.Smiler;
        else if (nearbyEntities.includes(EntityType.SkinStealer)) targetType = EntityType.SkinStealer;
        else targetType = EntityType.Hound;
        
        targetVolume = 0.15; // Faint and muffled
        isMuffled = true;
    }

    // If nothing has changed, just return
    if (targetType === currentEntityAmbienceType && entityAmbience?.playing()) {
        // Just update volume in case we switched from proximity to active or vice versa with same entity
        entityAmbience.fade(entityAmbience.volume(), targetVolume, 1000);
        return;
    }

    // Fade out old
    if (entityAmbience) {
        const old = entityAmbience;
        old.fade(old.volume(), 0, 1000);
        setTimeout(() => old.stop(), 1000);
        entityAmbience = null;
    }

    currentEntityAmbienceType = targetType;

    if (targetType) {
        let url = "";
        if (targetType === EntityType.Smiler) url = generateSmilerSound(isMuffled);
        else if (targetType === EntityType.Hound) url = generateHoundSound(isMuffled);
        else if (targetType === EntityType.SkinStealer) url = generateSkinStealerSound(isMuffled);
        else if (targetType === EntityType.Partygoer) url = generatePartygoerSound(isMuffled);
        else url = generateWhisper();

        const newSound = new Howl({
            src: [url],
            format: ['wav'],
            loop: true,
            volume: 0,
            autoplay: true
        });
        newSound.fade(0, targetVolume, 1000);
        entityAmbience = newSound;
    }
};
