import { useRef, useState } from 'react';

const clamp = (v) => Math.min(1, Math.max(0, v));

// Drag a rectangle on a 16:9 screen outline; values are fractions of the participant's calibrated display.
export default function RegionPicker({ value, onChange }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const rectFrom = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
  const box = drag ? rectFrom(drag.start, drag.current) : value;

  return (
    <div
      ref={ref}
      className="relative aspect-video w-full max-w-md cursor-crosshair select-none overflow-hidden rounded-lg border border-slate-300 bg-slate-100 dark:bg-slate-800"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); setDrag({ start: p, current: p }); }}
      onPointerMove={(e) => drag && setDrag({ ...drag, current: pos(e) })}
      onPointerUp={() => {
        if (!drag) return;
        const r = rectFrom(drag.start, drag.current);
        setDrag(null);
        if (r.width > 0.01 && r.height > 0.01) onChange(r);
      }}
      aria-label="Target region on the screen"
    >
      {box?.width > 0 && (
        <div className="absolute border-2 border-violet-500 bg-violet-500/20"
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />
      )}
    </div>
  );
}
