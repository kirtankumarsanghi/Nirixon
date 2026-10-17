import { useState, type CSSProperties } from "react";
import { cn } from "../utils/cn";

interface PhotoProps {
  src: string;
  alt: string;
  className?: string;
  /** Rendered behind the image while it loads and if it fails. */
  fallbackClassName?: string;
  eager?: boolean;
  style?: CSSProperties;
}

/**
 * Remote photography with a graceful load: a tinted placeholder shows while the
 * image streams in, then the photo fades up. Keeps layout stable (the parent
 * owns the size) and never leaves a broken-image icon.
 */
export function Photo({ src, alt, className, fallbackClassName, eager = false, style }: PhotoProps) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  return (
    <span
      className={cn("relative block overflow-hidden", fallbackClassName ?? "bg-gradient-to-br from-sand via-card-2 to-sand")}
      style={style}
    >
      {state !== "ready" && <span className="absolute inset-0 animate-pulse bg-sand/60" aria-hidden />}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
        className={cn(
          "size-full object-cover transition-opacity duration-700 ease-out",
          state === "ready" ? "opacity-100" : "opacity-0",
          className
        )}
      />
    </span>
  );
}
