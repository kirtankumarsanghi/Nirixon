import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { cn } from "../utils/cn";

/**
 * A small, dependency-free slippy map: OpenStreetMap raster tiles, drag to pan,
 * +/- to zoom, and one numbered marker per facility. It replaces the old
 * single-pin iframe so a family or health worker can actually see which
 * centres are close to each other and to the search origin.
 */

export interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  color: string;
  label: string;
}

const TILE = 256;
const MIN_Z = 3;
const MAX_Z = 18;
const FALLBACK_SIZE = { w: 640, h: 400 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function project(lat: number, lng: number, z: number) {
  const scale = TILE * 2 ** z;
  const s = Math.sin((clamp(lat, -85.05, 85.05) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

function unproject(x: number, y: number, z: number) {
  const scale = TILE * 2 ** z;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function fit(points: { lat: number; lng: number }[], w: number, h: number) {
  if (points.length === 0) return { lat: 22.5, lng: 79, zoom: 4 };
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng, zoom: 15 };
  const pad = 56;
  for (let z = 16; z >= MIN_Z; z--) {
    const px = points.map((p) => project(p.lat, p.lng, z));
    const minX = Math.min(...px.map((p) => p.x));
    const maxX = Math.max(...px.map((p) => p.x));
    const minY = Math.min(...px.map((p) => p.y));
    const maxY = Math.max(...px.map((p) => p.y));
    if (maxX - minX <= w - pad * 2 && maxY - minY <= h - pad * 2) {
      const c = unproject((minX + maxX) / 2, (minY + maxY) / 2, z);
      return { ...c, zoom: z };
    }
  }
  const c = points[0];
  return { lat: c.lat, lng: c.lng, zoom: MIN_Z };
}

export function FacilityMap({
  points,
  origin,
  selectedId,
  highlightId,
  onSelect,
  className,
}: {
  points: MapPoint[];
  origin: { lat: number; lng: number } | null;
  selectedId: number | null;
  /** Facility that is the live referral destination (drawn with a green ring). */
  highlightId?: number | null;
  onSelect: (id: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK_SIZE);
  const [view, setView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitAll = useCallback(() => {
    const pts = [...points, ...(origin ? [origin] : [])];
    setView(fit(pts, size.w, size.h));
  }, [points, origin, size.w, size.h]);

  // Re-fit whenever the result set or the search origin changes.
  const signature = useMemo(
    () => `${points.map((p) => p.id).join(",")}|${origin?.lat ?? ""},${origin?.lng ?? ""}`,
    [points, origin],
  );
  const lastSig = useRef("");
  useEffect(() => {
    if (lastSig.current === signature && view) return;
    lastSig.current = signature;
    fitAll();
  }, [signature, fitAll, view]);

  const v = view ?? fit([], size.w, size.h);
  const center = project(v.lat, v.lng, v.zoom);
  const left = center.x - size.w / 2;
  const top = center.y - size.h / 2;

  const tiles = useMemo(() => {
    const n = 2 ** v.zoom;
    const out: { key: string; x: number; y: number; src: string }[] = [];
    const x0 = Math.floor(left / TILE);
    const x1 = Math.floor((left + size.w) / TILE);
    const y0 = Math.max(0, Math.floor(top / TILE));
    const y1 = Math.min(n - 1, Math.floor((top + size.h) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wrapped = ((tx % n) + n) % n;
        out.push({
          key: `${v.zoom}/${tx}/${ty}`,
          x: tx * TILE - left,
          y: ty * TILE - top,
          src: `https://tile.openstreetmap.org/${v.zoom}/${wrapped}/${ty}.png`,
        });
      }
    }
    return out;
  }, [v.zoom, left, top, size.w, size.h]);

  const zoomBy = (d: number) =>
    setView((cur) => {
      const base = cur ?? v;
      return { ...base, zoom: clamp(base.zoom + d, MIN_Z, MAX_Z) };
    });

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-map-ui]")) return;
    drag.current = { x: e.clientX, y: e.clientY, cx: center.x, cy: center.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    const next = unproject(d.cx - dx, d.cy - dy, v.zoom);
    setView({ lat: clamp(next.lat, -85, 85), lng: next.lng, zoom: v.zoom });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const originPx = origin ? project(origin.lat, origin.lng, v.zoom) : null;

  return (
    <div
      ref={box}
      role="application"
      aria-label="Map of nearby facilities"
      className={cn(
        "relative h-[380px] w-full touch-none overflow-hidden rounded-[24px] bg-[#e9e1cf] select-none",
        drag.current ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => zoomBy(1)}
    >
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.src}
          alt=""
          draggable={false}
          loading="lazy"
          className="pointer-events-none absolute max-w-none"
          style={{ left: t.x, top: t.y, width: TILE, height: TILE }}
        />
      ))}

      {originPx && (
        <span
          className="pointer-events-none absolute z-10 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center"
          style={{ left: originPx.x - left, top: originPx.y - top }}
          aria-label="Search location"
        >
          <span className="absolute size-9 animate-ping rounded-full bg-peach/40" />
          <span className="size-3.5 rounded-full border-[3px] border-white bg-peach shadow" />
        </span>
      )}

      {points.map((p, i) => {
        const px = project(p.lat, p.lng, v.zoom);
        const x = px.x - left;
        const y = px.y - top;
        if (x < -30 || y < -30 || x > size.w + 30 || y > size.h + 30) return null;
        const on = p.id === selectedId;
        const live = p.id === highlightId;
        return (
          <button
            key={p.id}
            type="button"
            data-map-ui
            onClick={() => onSelect(p.id)}
            aria-label={`${i + 1}. ${p.label}`}
            title={p.label}
            className={cn(
              "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-mono text-[11px] font-bold text-night shadow-[0_3px_8px_rgba(0,0,0,.35)] transition-all",
              on ? "z-20 size-9 ring-4 ring-ink/80" : "z-10 size-7 hover:z-20 hover:scale-110",
              live && "ring-4 ring-moss",
            )}
            style={{ left: x, top: y, background: p.color }}
          >
            {i + 1}
          </button>
        );
      })}

      <div data-map-ui className="absolute top-3 right-3 z-30 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom in"
          className="grid size-9 place-items-center rounded-full bg-card text-ink shadow hover:bg-white"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom out"
          className="grid size-9 place-items-center rounded-full bg-card text-ink shadow hover:bg-white"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          onClick={fitAll}
          aria-label="Show all facilities"
          className="grid size-9 place-items-center rounded-full bg-card text-ink shadow hover:bg-white"
        >
          <Scan className="size-4" />
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-0 left-0 z-30 rounded-tr-xl bg-white/85 px-2.5 py-1 text-[10px] text-ink-2">
        © OpenStreetMap contributors
      </p>
    </div>
  );
}
