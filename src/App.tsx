import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { GARMENT_REGIONS, GarmentSvg, GarmentType } from './components/GarmentSvg';

const MODEL_URL = "https://teachablemachine.withgoogle.com/models/Z1BKm3t_J/";

/**
 * Label-to-colour map for the Teachable Machine audio model.
 * Keys match the spoken Malayalam colour labels in the model.
 * "Background Noise" (and "_background_noise_") are automatically ignored.
 * Edit any colour hex or display label below to customize the palette.
 */
const LABEL_COLOUR_MAP: Record<
  string,
  { label: string; english: string; hex: string; textHex: string }
> = {
  Pacha:   { label: "Pacha",   english: "Green",  hex: "#1E7F4F", textHex: "#FFFFFF" },
  Manja:   { label: "Manja",   english: "Yellow", hex: "#F2C94C", textHex: "#1C1917" },
  Neela:   { label: "Neela",   english: "Blue",   hex: "#1D4ED8", textHex: "#FFFFFF" },
  Chuvapp: { label: "Chuvapp", english: "Red",    hex: "#C81E2B", textHex: "#FFFFFF" },
  Karupp:  { label: "Karupp",  english: "Black",  hex: "#1B1B1E", textHex: "#FFFFFF" },
  Ponnu:   { label: "Ponnu",   english: "Gold",   hex: "#D4AF37", textHex: "#1C1917" },
};

const CONFIDENCE_THRESHOLD = 0.70;
const TRIGGER_COOLDOWN_MS = 1000;

interface SpeechCommandsResult {
  scores: Float32Array | number[];
}

interface SpeechCommandsRecognizer {
  ensureModelLoaded: () => Promise<void>;
  wordLabels: () => string[];
  listen: (
    callback: (result: SpeechCommandsResult) => void,
    options?: {
      includeSpectrogram?: boolean;
      probabilityThreshold?: number;
      invokeCallbackOnNoiseAndUnknown?: boolean;
      overlapFactor?: number;
    }
  ) => Promise<void>;
  stopListening: () => Promise<void>;
  isListening: () => boolean;
}

declare global {
  interface Window {
    speechCommands?: {
      create: (
        fftType: string,
        vocabulary?: string,
        modelURL?: string,
        metadataURL?: string
      ) => SpeechCommandsRecognizer;
    };
  }
}

type Screen = 'home' | 'colouring';
type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
type MicStatus = 'idle' | 'starting' | 'listening' | 'paused' | 'denied' | 'error';

interface HeardState {
  label: string;
  english: string;
  hex: string;
  confidence: number;
  triggered: boolean;
}

function findColourEntry(rawLabel: string) {
  const normalized = rawLabel.trim().toLowerCase();
  if (
    !normalized ||
    normalized === 'background noise' ||
    normalized === '_background_noise_'
  ) {
    return null;
  }
  const matchedKey = Object.keys(LABEL_COLOUR_MAP).find(
    (key) => key.toLowerCase() === normalized
  );
  return matchedKey ? LABEL_COLOUR_MAP[matchedKey] : null;
}

const COLOUR_LIST = Object.values(LABEL_COLOUR_MAP);

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [garment, setGarment] = useState<GarmentType>('saree');
  const [regionColours, setRegionColours] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [isCooldown, setIsCooldown] = useState<boolean>(false);
  const [lastHeard, setLastHeard] = useState<HeardState | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const recognizerRef = useRef<SpeechCommandsRecognizer | null>(null);
  const garmentRef = useRef<GarmentType>(garment);
  const activeIndexRef = useRef<number>(activeIndex);
  const isCooldownRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<number | null>(null);
  const screenRef = useRef<Screen>(screen);

  useEffect(() => {
    garmentRef.current = garment;
  }, [garment]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const clearCooldown = useCallback(() => {
    if (cooldownTimerRef.current !== null) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    isCooldownRef.current = false;
    setIsCooldown(false);
  }, []);

  const stopListeningSafely = useCallback(async () => {
    const rec = recognizerRef.current;
    if (!rec) return;
    try {
      if (rec.isListening()) {
        await rec.stopListening();
      }
    } catch {
      // Ignore stop errors if stream already closed
    }
  }, []);

  useEffect(() => {
    return () => {
      clearCooldown();
      void stopListeningSafely();
    };
  }, [clearCooldown, stopListeningSafely]);

  const applyColourToCurrentRegion = useCallback(
    (entry: { label: string; english: string; hex: string }, fromVoice: boolean, confidence?: number) => {
      const currentGarment = garmentRef.current;
      const regions = GARMENT_REGIONS[currentGarment];
      const idx = activeIndexRef.current;

      if (idx >= regions.length) {
        return;
      }

      const targetRegion = regions[idx];

      setRegionColours((prev) => ({
        ...prev,
        [targetRegion.id]: entry.hex,
      }));

      if (fromVoice && confidence !== undefined) {
        setLastHeard({
          label: entry.label,
          english: entry.english,
          hex: entry.hex,
          confidence,
          triggered: true,
        });
      }

      clearCooldown();
      isCooldownRef.current = true;
      setIsCooldown(true);

      const waitMs = fromVoice ? TRIGGER_COOLDOWN_MS : 320;
      cooldownTimerRef.current = window.setTimeout(() => {
        isCooldownRef.current = false;
        setIsCooldown(false);
        cooldownTimerRef.current = null;

        setActiveIndex((prev) => {
          const next = Math.min(prev + 1, regions.length);
          activeIndexRef.current = next;
          return next;
        });
      }, waitMs);
    },
    [clearCooldown]
  );

  const loadRecognizer = useCallback(async (): Promise<SpeechCommandsRecognizer | null> => {
    if (recognizerRef.current) {
      setModelStatus('ready');
      setModelError(null);
      return recognizerRef.current;
    }

    setModelStatus('loading');
    setModelError(null);

    try {
      // Wait briefly if CDN scripts are still initializing
      if (!window.speechCommands) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
      if (!window.speechCommands) {
        throw new Error(
          'Speech recognition library failed to load. Please check your internet connection and refresh the page.'
        );
      }

      const baseUrl = MODEL_URL.endsWith('/') ? MODEL_URL : `${MODEL_URL}/`;
      const checkpointURL = `${baseUrl}model.json`;
      const metadataURL = `${baseUrl}metadata.json`;

      const recognizer = window.speechCommands.create(
        'BROWSER_FFT',
        undefined,
        checkpointURL,
        metadataURL
      );

      await recognizer.ensureModelLoaded();
      recognizerRef.current = recognizer;
      setModelStatus('ready');
      return recognizer;
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Failed to load the Teachable Machine audio model.';
      setModelStatus('error');
      setModelError(
        `Could not load the voice model (${message}). You can still colour by tapping the colour buttons below.`
      );
      return null;
    }
  }, []);

  const startVoiceListening = useCallback(async () => {
    setMicError(null);
    setMicStatus('starting');

    const recognizer = await loadRecognizer();
    if (!recognizer) {
      setMicStatus('error');
      return;
    }

    // If user already navigated back to home while model was loading, don't start mic
    if (screenRef.current !== 'colouring') {
      setMicStatus('idle');
      return;
    }

    try {
      await stopListeningSafely();

      const classLabels = recognizer.wordLabels();

      await recognizer.listen(
        (result) => {
          if (screenRef.current !== 'colouring') return;

          const scores = Array.from(result.scores || []);
          let bestEntry: { label: string; english: string; hex: string } | null = null;
          let bestScore = -1;

          for (let i = 0; i < classLabels.length; i++) {
            const label = classLabels[i];
            const entry = findColourEntry(label);
            if (!entry) continue; // Ignores "Background Noise" and unknown labels
            const score = scores[i] ?? 0;
            if (score > bestScore) {
              bestScore = score;
              bestEntry = entry;
            }
          }

          if (!bestEntry || bestScore < 0) return;

          // Only update display when a colour word is meaningfully heard (not ambient silence)
          if (bestScore >= 0.35) {
            setLastHeard((prev) => {
              if (isCooldownRef.current && prev?.triggered) {
                return prev;
              }
              return {
                label: bestEntry!.label,
                english: bestEntry!.english,
                hex: bestEntry!.hex,
                confidence: bestScore,
                triggered: bestScore > CONFIDENCE_THRESHOLD && !isCooldownRef.current,
              };
            });
          }

          // Trigger colour fill when confidence > 0.70 and not in 1-second cooldown
          if (bestScore > CONFIDENCE_THRESHOLD && !isCooldownRef.current) {
            const regions = GARMENT_REGIONS[garmentRef.current];
            if (activeIndexRef.current < regions.length) {
              applyColourToCurrentRegion(bestEntry, true, bestScore);
            }
          }
        },
        {
          includeSpectrogram: false,
          probabilityThreshold: 0.5,
          invokeCallbackOnNoiseAndUnknown: true,
          overlapFactor: 0.5,
        }
      );

      if (screenRef.current !== 'colouring') {
        await stopListeningSafely();
        setMicStatus('idle');
        return;
      }

      setMicStatus('listening');
    } catch (err) {
      const errObj = err as { name?: string; message?: string };
      const msg = errObj?.message || '';
      const name = errObj?.name || '';
      const isDenied =
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError' ||
        /denied|permission|not allowed/i.test(msg);

      if (isDenied) {
        setMicStatus('denied');
        setMicError(
          'Microphone permission was denied. Allow microphone access in your browser settings and tap Retry Mic, or use the colour buttons below.'
        );
      } else {
        setMicStatus('error');
        setMicError(
          msg
            ? `Microphone could not start: ${msg}. You can use the colour buttons below instead.`
            : 'Unable to access microphone on this device. You can use the colour buttons below instead.'
        );
      }
    }
  }, [applyColourToCurrentRegion, loadRecognizer, stopListeningSafely]);

  const handleSelectGarment = (chosen: GarmentType) => {
    clearCooldown();
    setGarment(chosen);
    garmentRef.current = chosen;
    setRegionColours({});
    setActiveIndex(0);
    activeIndexRef.current = 0;
    setLastHeard(null);
    setScreen('colouring');
    screenRef.current = 'colouring';
    void startVoiceListening();
  };

  const handleBackToHome = async () => {
    clearCooldown();
    screenRef.current = 'home';
    setScreen('home');
    setMicStatus('idle');
    setMicError(null);
    await stopListeningSafely();
  };

  const handleRestart = () => {
    clearCooldown();
    setRegionColours({});
    setActiveIndex(0);
    activeIndexRef.current = 0;
    setLastHeard(null);
    if (micStatus === 'paused') {
      void startVoiceListening();
    }
  };

  const handleToggleMic = async () => {
    if (micStatus === 'listening') {
      await stopListeningSafely();
      setMicStatus('paused');
    } else {
      await startVoiceListening();
    }
  };

  const handleDownloadPng = async () => {
    const svgEl = svgRef.current;
    if (!svgEl || isExporting) return;

    setIsExporting(true);
    try {
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.querySelectorAll('[data-export-exclude="true"]').forEach((node) => node.remove());
      clone.setAttribute('width', '840');
      clone.setAttribute('height', '1120');

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 840;
          canvas.height = 1120;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Canvas context unavailable'));
            return;
          }
          ctx.fillStyle = '#FAF8F3';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);

          const pngUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `kerala-kasavu-${garment}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to render PNG'));
        };
        img.src = url;
      });
    } finally {
      setIsExporting(false);
    }
  };

  const regions = GARMENT_REGIONS[garment];
  const isCompleted = activeIndex >= regions.length;
  const activeRegion = !isCompleted ? regions[activeIndex] : null;

  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-[#FAF8F3] text-[#1C1917] flex flex-col">
        <header className="border-b border-[#E7E2D8] bg-white/80 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
            <span className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[#1C1917] whitespace-nowrap">
              Kasavu Voice Studio
            </span>
            <span className="text-xs sm:text-sm text-[#57534E] whitespace-nowrap hidden sm:inline">
              Kerala Handloom Colouring · Malayalam Voice
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-14 flex flex-col justify-center">
          <div className="max-w-2xl mb-8 sm:mb-12">
            <p className="text-xs sm:text-sm font-medium text-[#9A7B2C] mb-2">
              Handloom Colouring Studio
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight text-[#1C1917] leading-[1.12] text-balance mb-3">
              Colour a Kerala Kasavu Saree or Mundu with your voice
            </h1>
            <p className="text-base sm:text-lg text-[#57534E] leading-relaxed">
              Choose a garment below. Each region highlights in order—speak a Malayalam colour name or tap a swatch to fill it.
            </p>
          </div>

          {/* Two big primary garment buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-7 mb-10">
            <button
              type="button"
              onClick={() => handleSelectGarment('saree')}
              className="group text-left bg-white border border-[#E7E2D8] hover:border-[#9A7B2C] rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C] active:scale-[0.99] flex items-center justify-between gap-5 min-h-[168px]"
            >
              <div className="flex flex-col justify-between h-full">
                <div>
                  <span className="text-xs font-medium text-[#78716C] block mb-1.5">
                    4 Regions · Body, Kara, Pallu, Blouse
                  </span>
                  <span className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1917] group-hover:text-[#7C5E18] transition-colors block">
                    Saree
                  </span>
                </div>
                <span className="mt-6 inline-flex items-center text-sm font-semibold text-[#9A7B2C] group-hover:translate-x-0.5 transition-transform">
                  Start colouring Saree →
                </span>
              </div>

              <div className="w-24 sm:w-28 shrink-0">
                <GarmentSvg
                  garment="saree"
                  regionColours={{ kara: '#D4AF37', pallu: '#FAF4E1' }}
                  activeRegionId={null}
                  className="w-full h-auto"
                />
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectGarment('mundu')}
              className="group text-left bg-white border border-[#E7E2D8] hover:border-[#9A7B2C] rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C] active:scale-[0.99] flex items-center justify-between gap-5 min-h-[168px]"
            >
              <div className="flex flex-col justify-between h-full">
                <div>
                  <span className="text-xs font-medium text-[#78716C] block mb-1.5">
                    2 Regions · Body, Kara
                  </span>
                  <span className="font-display text-3xl sm:text-4xl font-semibold text-[#1C1917] group-hover:text-[#7C5E18] transition-colors block">
                    Mundu
                  </span>
                </div>
                <span className="mt-6 inline-flex items-center text-sm font-semibold text-[#9A7B2C] group-hover:translate-x-0.5 transition-transform">
                  Start colouring Mundu →
                </span>
              </div>

              <div className="w-24 sm:w-28 shrink-0">
                <GarmentSvg
                  garment="mundu"
                  regionColours={{ kara: '#D4AF37' }}
                  activeRegionId={null}
                  className="w-full h-auto"
                />
              </div>
            </button>
          </div>

          {/* Malayalam Voice Colour Reference */}
          <section className="border-t border-[#E7E2D8] pt-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-base font-semibold text-[#1C1917]">
                Supported Voice Commands
              </h2>
              <p className="text-xs sm:text-sm text-[#57534E]">
                Microphone begins listening once you choose a garment
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {COLOUR_LIST.map((c) => (
                <div
                  key={c.label}
                  className="bg-white border border-[#E7E2D8] rounded-xl px-3.5 py-3 flex items-center gap-3"
                >
                  <span
                    className="w-5 h-5 rounded-full shrink-0 border border-black/15"
                    style={{ backgroundColor: c.hex }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#1C1917] truncate">
                      {c.label}
                    </div>
                    <div className="text-xs text-[#57534E] truncate">
                      {c.english}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Colouring Screen
  const confidencePercent = lastHeard
    ? Math.min(100, Math.round(lastHeard.confidence * 100))
    : 0;

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#1C1917] flex flex-col">
      {/* Compact Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#E7E2D8] bg-[#FAF8F3]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handleBackToHome}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 sm:px-3.5 rounded-xl text-sm font-medium text-[#1C1917] hover:bg-black/5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C]"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back to Home</span>
          </button>

          <h1 className="font-display text-lg sm:text-2xl font-semibold text-[#1C1917] truncate">
            {garment === 'saree' ? 'Kerala Kasavu Saree' : 'Kerala Kasavu Mundu'}
          </h1>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 sm:px-3.5 rounded-xl text-sm font-medium border border-[#E7E2D8] bg-white hover:bg-[#F4F0E6] text-[#1C1917] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C]"
              aria-label="Restart colouring"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Restart</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 sm:px-4 rounded-xl text-sm font-semibold bg-[#1C1917] hover:bg-[#292524] text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C]"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">
                {isExporting ? 'Saving…' : 'Download as PNG'}
              </span>
              <span className="md:hidden">PNG</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-7">
        {/* Error banners for denied mic or failed model load */}
        {(modelStatus === 'error' || micStatus === 'denied' || micStatus === 'error') && (
          <div
            role="alert"
            className="mb-5 bg-[#FEF2F2] border border-[#FECACA] text-[#7F1D1D] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed">
                <p className="font-semibold">
                  {modelStatus === 'error'
                    ? 'Voice model unavailable'
                    : micStatus === 'denied'
                    ? 'Microphone access denied'
                    : 'Microphone error'}
                </p>
                <p className="text-[#991B1B] mt-0.5">
                  {modelError || micError}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void startVoiceListening()}
              className="min-h-[44px] px-4 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              {modelStatus === 'error' ? 'Retry Model' : 'Retry Microphone'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5 sm:gap-7 items-start">
          {/* Left: Garment SVG Canvas & Ordered Region Strip */}
          <section className="bg-white border border-[#E7E2D8] rounded-2xl p-3 sm:p-5">
            {/* Ordered region step bar */}
            <div className="flex flex-wrap items-center gap-2 pb-3 mb-3 border-b border-[#EFECE4]">
              {regions.map((region, idx) => {
                const isActive = idx === activeIndex;
                const filledHex = regionColours[region.id];
                return (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => {
                      clearCooldown();
                      setActiveIndex(idx);
                      activeIndexRef.current = idx;
                    }}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C] ${
                      isActive
                        ? 'bg-[#FEF3C7] text-[#92400E] border border-[#D97706]'
                        : 'bg-[#FAF8F3] text-[#44403C] border border-[#E7E2D8] hover:border-[#C7BFA9]'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full text-xs font-bold inline-flex items-center justify-center shrink-0 border border-black/15"
                      style={{
                        backgroundColor: filledHex || (isActive ? '#D97706' : '#FFFFFF'),
                        color:
                          filledHex &&
                          ['#1E7F4F', '#1D4ED8', '#C81E2B', '#1B1B1E'].includes(filledHex)
                            ? '#FFFFFF'
                            : isActive && !filledHex
                            ? '#FFFFFF'
                            : '#1C1917',
                      }}
                    >
                      {region.number}
                    </span>
                    <span>{region.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active instruction line */}
            <div className="flex items-center justify-between gap-2 mb-2 px-1">
              {activeRegion ? (
                <p className="text-sm text-[#44403C]">
                  Now colouring{' '}
                  <span className="font-semibold text-[#1C1917]">
                    {activeRegion.number}. {activeRegion.label}
                  </span>{' '}
                  <span className="text-[#78716C] hidden sm:inline">
                    · {activeRegion.malayalamHint}
                  </span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-[#1E7F4F] inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  All regions coloured! Tap any region to adjust, or download PNG.
                </p>
              )}

              {isCooldown && (
                <span className="text-xs font-medium text-[#B45309] tabular-nums whitespace-nowrap">
                  Next region in 1s…
                </span>
              )}
            </div>

            {/* Garment SVG */}
            <div className="flex justify-center">
              <GarmentSvg
                garment={garment}
                regionColours={regionColours}
                activeRegionId={activeRegion ? activeRegion.id : null}
                onSelectRegion={(idx) => {
                  clearCooldown();
                  setActiveIndex(idx);
                  activeIndexRef.current = idx;
                }}
                svgRef={svgRef}
                className="w-full max-w-[360px] sm:max-w-[400px] h-auto select-none"
              />
            </div>
          </section>

          {/* Right: Voice Readout & Tap Fallback Palette */}
          <div className="flex flex-col gap-5">
            {/* Voice Recognition Card */}
            <section className="bg-white border border-[#E7E2D8] rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  {modelStatus === 'loading' || micStatus === 'starting' ? (
                    <Loader2 className="w-5 h-5 text-[#9A7B2C] animate-spin shrink-0" />
                  ) : micStatus === 'listening' ? (
                    <Mic className="w-5 h-5 text-[#1E7F4F] shrink-0" />
                  ) : (
                    <MicOff className="w-5 h-5 text-[#78716C] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[#1C1917] truncate">
                      {modelStatus === 'loading'
                        ? 'Loading voice model…'
                        : micStatus === 'starting'
                        ? 'Starting microphone…'
                        : micStatus === 'listening'
                        ? 'Listening for colour'
                        : micStatus === 'paused'
                        ? 'Microphone paused'
                        : micStatus === 'denied'
                        ? 'Microphone denied'
                        : 'Microphone inactive'}
                    </h2>
                    <p className="text-xs text-[#57534E]">
                      {micStatus === 'listening'
                        ? 'Speak clearly · Triggers above 0.70 confidence'
                        : 'Tap Resume Mic or colour with swatches below'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleToggleMic()}
                  disabled={modelStatus === 'loading' || micStatus === 'starting'}
                  className={`min-h-[44px] px-3.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C] ${
                    micStatus === 'listening'
                      ? 'bg-[#FAF8F3] border border-[#E7E2D8] text-[#1C1917] hover:bg-[#F0ECE1]'
                      : 'bg-[#1E7F4F] text-white hover:bg-[#17653E]'
                  }`}
                >
                  {micStatus === 'listening' ? 'Pause Mic' : 'Start Mic'}
                </button>
              </div>

              {/* Last heard word & confidence readout */}
              <div className="bg-[#FAF8F3] border border-[#E7E2D8] rounded-xl p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-[#57534E] inline-flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" />
                    Last heard word
                  </span>
                  <span className="font-mono text-xs text-[#57534E] tabular-nums">
                    Threshold: 0.70
                  </span>
                </div>

                {lastHeard ? (
                  <div>
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                          style={{ backgroundColor: lastHeard.hex }}
                          aria-hidden="true"
                        />
                        <span className="text-lg font-semibold text-[#1C1917] truncate">
                          {lastHeard.label}
                        </span>
                        <span className="text-sm text-[#57534E]">
                          ({lastHeard.english})
                        </span>
                      </div>

                      <span
                        className={`font-mono text-base font-semibold tabular-nums shrink-0 ${
                          lastHeard.confidence > CONFIDENCE_THRESHOLD
                            ? 'text-[#1E7F4F]'
                            : 'text-[#1C1917]'
                        }`}
                      >
                        {lastHeard.confidence.toFixed(2)}
                      </span>
                    </div>

                    {/* Confidence bar with 0.70 threshold marker */}
                    <div className="relative h-2 w-full bg-[#E7E2D8] rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-150 rounded-full"
                        style={{
                          width: `${confidencePercent}%`,
                          backgroundColor:
                            lastHeard.confidence > CONFIDENCE_THRESHOLD
                              ? '#1E7F4F'
                              : '#D97706',
                        }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-[#1C1917]/70"
                        style={{ left: '90%' }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#78716C] py-1">
                    {micStatus === 'listening'
                      ? 'Say "Pacha", "Manja", "Neela", "Chuvapp", "Karupp", or "Ponnu"…'
                      : 'No colour spoken yet'}
                  </p>
                )}
              </div>
            </section>

            {/* Fallback Colour Tap Buttons */}
            <section className="bg-white border border-[#E7E2D8] rounded-2xl p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2 mb-3.5">
                <h2 className="text-sm font-semibold text-[#1C1917]">
                  Tap a colour
                </h2>
                <span className="text-xs text-[#57534E]">
                  {activeRegion
                    ? `Fills ${activeRegion.number}. ${activeRegion.label}`
                    : 'Select any region first'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {COLOUR_LIST.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    disabled={!activeRegion}
                    onClick={() => applyColourToCurrentRegion(c, false)}
                    className="min-h-[56px] px-3.5 py-2.5 rounded-xl border border-[#E7E2D8] bg-[#FAF8F3] hover:bg-white hover:border-[#9A7B2C] active:scale-[0.98] transition-all flex items-center gap-3 text-left disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C]"
                  >
                    <span
                      className="w-7 h-7 rounded-full shrink-0 border border-black/15 shadow-xs"
                      style={{ backgroundColor: c.hex }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#1C1917] leading-tight truncate">
                        {c.label}
                      </span>
                      <span className="block text-xs text-[#57534E] leading-tight mt-0.5 truncate">
                        {c.english}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Quick Bottom Actions (especially helpful on mobile) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRestart}
                className="min-h-[48px] px-4 rounded-xl border border-[#E7E2D8] bg-white hover:bg-[#F4F0E6] text-sm font-semibold text-[#1C1917] inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={isExporting}
                className="min-h-[48px] px-4 rounded-xl bg-[#1C1917] hover:bg-[#292524] text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A7B2C]"
              >
                <Download className="w-4 h-4" />
                <span>{isExporting ? 'Saving…' : 'Download as PNG'}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
