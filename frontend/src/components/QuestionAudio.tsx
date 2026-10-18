import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Volume2 } from "lucide-react";
import { shareApi } from "../api/client";
import type { AudioItemQueryResponse } from "../api/types";
import { cn } from "../utils/cn";

const speechAvailable = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  typeof SpeechSynthesisUtterance !== "undefined";

function pickVoice(lang: "en" | "hi"): SpeechSynthesisVoice | undefined {
  if (!speechAvailable()) return undefined;
  const prefix = lang === "hi" ? "hi" : "en";
  return window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(prefix));
}

/**
 * Plays narration for a question.
 *
 * 1. If the server has a reviewed clip (Module A, mandatory flags) it plays that
 *    MP3 — including the validated Hindi transcript.
 * 2. Otherwise it reads the exact on-screen question with the browser's speech
 *    synthesis (the full adaptive Module B bank is far too large to pre-record,
 *    and its source text is English-only). Speed applies to both paths.
 */
export function QuestionAudio({
  itemId,
  lang,
  text,
  className,
}: {
  itemId: string;
  lang: "en" | "hi";
  /** The question currently on screen; used when no pre-recorded clip exists. */
  text?: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [entry, setEntry] = useState<AudioItemQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<1 | 0.8>(1);

  useEffect(() => {
    let cancelled = false;
    if (speechAvailable()) window.speechSynthesis.cancel();
    setEntry(null);
    setPlaying(false);
    setLoading(true);
    shareApi
      .getAudioItem(itemId, lang)
      .then((res) => {
        if (!cancelled) setEntry(res);
      })
      .catch(() => {
        if (!cancelled) setEntry(null); // fall through to speech synthesis
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (speechAvailable()) window.speechSynthesis.cancel();
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

  const serverAudio = Boolean(entry?.has_audio && entry.audio?.audio_url);
  const speakText = entry?.text ?? (lang === "en" ? text : undefined);
  const canSpeak = !serverAudio && Boolean(speakText) && speechAvailable();

  if (!serverAudio && !canSpeak) return null;

  const toggle = async () => {
    if (serverAudio && entry?.audio?.audio_url) {
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
      return;
    }

    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
      setPlaying(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(speakText as string);
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    synth.cancel();
    synth.speak(utterance);
    setPlaying(true);
  };

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {serverAudio && (
        <audio ref={audioRef} src={entry?.audio?.audio_url} preload="none" onEnded={() => setPlaying(false)} />
      )}
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
