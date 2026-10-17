import { useEffect, useRef, useState } from "react";
import type { AudioItemEntry } from "../api/types";
import audioManifestJson from "../data/audio_manifest.json";

export interface AudioNarrationBarProps {
  itemId: string;
  questionText: string;
  nextItemId?: string;
  initialLanguage?: "en" | "hi";
  onLanguageChange?: (lang: "en" | "hi") => void;
  className?: string;
}

/**
 * Checks if a manifest entry is clinically reviewed.
 * Unreviewed files (missing reviewed_by or reviewed_date, or status !== 'reviewed')
 * are strictly hidden by default to protect clinical safety.
 */
export function getReviewedAudioEntry(itemId: string, language: "en" | "hi"): AudioItemEntry | null {
  const items = (audioManifestJson.items as Record<string, Record<string, any>>);
  const itemDict = items[itemId];
  if (!itemDict) return null;

  const entry = itemDict[language];
  if (!entry) return null;

  // Strict clinical gating check
  if (
    entry.status !== "reviewed" ||
    !entry.reviewed_by ||
    !entry.reviewed_date
  ) {
    return null;
  }

  return entry as AudioItemEntry;
}

export function AudioNarrationBar({
  itemId,
  questionText: _questionText,
  nextItemId,
  initialLanguage = "en",
  onLanguageChange,
  className = "",
}: AudioNarrationBarProps) {
  const [language, setLanguage] = useState<"en" | "hi">(initialLanguage);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.8 | 1.0>(1.0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [loadError, setLoadError] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Active reviewed entry
  const activeEntry = getReviewedAudioEntry(itemId, language);
  const hasAudio = activeEntry !== null && !loadError;

  // Reset audio on question or language change
  useEffect(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause?.();
        audioRef.current.currentTime = 0;
      } catch {
        // Safe fallback in test or headless environments
      }
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setLoadError(false);

    if (activeEntry && audioRef.current) {
      audioRef.current.src = activeEntry.audio_url;
      audioRef.current.playbackRate = playbackSpeed;
      try {
        audioRef.current.load?.();
      } catch {
        // Safe fallback
      }
    }
  }, [itemId, language, activeEntry?.audio_url]);

  // Keep playback rate in sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Prefetch next item if provided
  useEffect(() => {
    if (!nextItemId) return;
    const next = getReviewedAudioEntry(nextItemId, language);
    if (next?.audio_url) {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "audio";
      link.href = next.audio_url;
      document.head.appendChild(link);
      return () => {
        document.head.removeChild(link);
      };
    }
  }, [nextItemId, language]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !hasAudio) return;
    try {
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
      } else {
        await el.play();
        setIsPlaying(true);
      }
    } catch {
      setLoadError(true);
      setIsPlaying(false);
    }
  };

  const toggleSpeed = () => {
    setPlaybackSpeed((s) => (s === 1.0 ? 0.8 : 1.0));
  };

  const handleLanguageSwitch = (lang: "en" | "hi") => {
    setLanguage(lang);
    onLanguageChange?.(lang);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration || 0);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleError = () => {
    setLoadError(true);
    setIsPlaying(false);
  };

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return "0:00";
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? "0" : ""}${rem}`;
  };

  const progressPct =
    hasAudio && duration > 0
      ? Math.min(100, (currentTime / duration) * 100)
      : 0;

  return (
    <div
      className={`audio-bar ${className}`.trim()}
      role="region"
      aria-label="Audio narration controls"
    >
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
        style={{ display: "none" }}
        preload="metadata"
      />

      <div className="audio-bar__row">
        <div className="audio-bar__controls">
          {hasAudio ? (
            <button
              type="button"
              onClick={togglePlay}
              className={`audio-bar__play${isPlaying ? " audio-bar__play--active" : ""}`}
              aria-label={isPlaying ? "Pause audio narration" : "Play audio narration"}
            >
              {isPlaying ? "Pause" : "Play narration"}
            </button>
          ) : (
            <span className="audio-bar__fallback-chip">Text fallback active</span>
          )}

          {hasAudio ? (
            <button
              type="button"
              onClick={toggleSpeed}
              className={`audio-bar__speed${playbackSpeed === 0.8 ? " audio-bar__speed--slow" : ""}`}
              title={`Switch narration speed (currently ${playbackSpeed}x)`}
              aria-label={`Toggle narration speed, currently ${playbackSpeed}x`}
            >
              {playbackSpeed === 0.8 ? "0.8x" : "1.0x"}
            </button>
          ) : null}

          {hasAudio && duration > 0 ? (
            <span className="audio-bar__time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          ) : null}
        </div>

        <div
          role="group"
          aria-label="Select audio narration language"
          className="audio-bar__langs"
        >
          <button
            type="button"
            onClick={() => handleLanguageSwitch("en")}
            aria-pressed={language === "en"}
            className={language === "en" ? "audio-bar__lang audio-bar__lang--active" : "audio-bar__lang"}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => handleLanguageSwitch("hi")}
            aria-pressed={language === "hi"}
            className={language === "hi" ? "audio-bar__lang audio-bar__lang--active" : "audio-bar__lang"}
          >
            हिन्दी
          </button>
        </div>
      </div>

      {hasAudio && duration > 0 ? (
        <div className="audio-bar__track" aria-hidden>
          <div className="audio-bar__fill" style={{ width: `${progressPct}%` }} />
        </div>
      ) : null}

      {!hasAudio ? (
        <p className="audio-bar__note">
          Audio narration is not yet clinically reviewed for this question. Reading written text fallback.
        </p>
      ) : null}

      {hasAudio && activeEntry ? (
        <div className="audio-bar__meta">
          <span>
            Voice: {language === "hi" ? "हिन्दी ऑडियो" : "English Narration"} (Verified by{" "}
            {activeEntry.reviewed_by})
          </span>
          <span className="audio-bar__reviewed">✓ Clinically Reviewed</span>
        </div>
      ) : null}
    </div>
  );
}
