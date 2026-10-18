import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Volume2 } from "lucide-react";
import { shareApi } from "../api/client";
import type { AudioItemQueryResponse } from "../api/types";
import { cn } from "../utils/cn";

/**
 * Plays the clinically reviewed narration for a question. Clips are single
 * recordings, so speed is applied at playback time (0.8× / 1.0×). When no
 * reviewed audio exists the control simply disappears — the question text is
 * the fallback, never a broken player.
 */
export function QuestionAudio({
  itemId,
  lang,
  className,
}: {
  itemId: string;
  lang: "en" | "hi";
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [entry, setEntry] = useState<AudioItemQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<1 | 0.8>(1);

  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    setPlaying(false);
    setLoading(true);
    shareApi
      .getAudioItem(itemId, lang)
      .then((res) => {
        if (!cancelled) setEntry(res);
      })
      .catch(() => {
        if (!cancelled) setEntry(null); // fall back to text silently
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, lang]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate, entry]);

  if (loading) {
    return (
      <span className={cn("grid size-8 place-items-center text-muted", className)} aria-hidden>
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }
  if (!entry?.has_audio || !entry.audio?.audio_url) return null;

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      audio.currentTime = 0;
      audio.playbackRate = rate;
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <audio ref={audioRef} src={entry.audio.audio_url} preload="none" onEnded={() => setPlaying(false)} />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause question audio" : "Play question audio"}
        aria-pressed={playing}
        className="grid size-8 place-items-center rounded-full border border-line-2 transition-colors hover:bg-sand"
      >
        {playing ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => setRate((r) => (r === 1 ? 0.8 : 1))}
        aria-label={`Playback speed ${rate === 1 ? "1.0" : "0.8"} times`}
        className="rounded-full px-1.5 py-1 font-mono text-[10px] font-bold text-muted transition-colors hover:text-ink"
      >
        {rate === 1 ? "1.0×" : "0.8×"}
      </button>
    </span>
  );
}
