import { cn } from "@/lib/utils";

function getGradeLabel(grade: string): string {
  switch (grade) {
    case "A": return "Excellent";
    case "B": return "Good";
    case "C": return "Fair";
    case "D": return "Needs Attention";
    case "F": return "Critical";
    default: return grade;
  }
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// Arc spans -180° (left) → 0° (right). Score 0→100 maps linearly across 180°.
const GAUGE_START = -180;
const GAUGE_END = 0;
const ZONE_FAIL = 40;
const ZONE_WARN = 70;

function scoreToAngle(s: number) {
  return GAUGE_START + (s / 100) * 180;
}

function scoreColor(s: number) {
  return s >= ZONE_WARN ? "#10b981" : s >= ZONE_FAIL ? "#f59e0b" : "#ef4444";
}

/**
 * Clean half-arc gauge — no needle.
 *
 * Layout: arc center (cx, cy) sits at the very BOTTOM of the SVG viewport.
 * The upper half of the circle is visible; the lower half is clipped.
 * Score text lives between the arc center and the arc, clearly inside the opening.
 *
 *       ╭────────────╮
 *      /  ╭────────╮  \          ← colored arc track
 *     /  /          \  \
 *    |  |    [13]    |  |        ← score inside the arc opening
 *    |  |  Grade F   |  |
 *     ╰──────────────────╯       ← cy (bottom of SVG, not visible)
 */
export function HealthScoreGauge({
  score,
  grade,
  size = 280,
  mini = false,
  className,
}: {
  score: number;
  grade: string;
  size?: number;
  mini?: boolean;
  className?: string;
}) {
  const clamp = Math.min(100, Math.max(0, score));
  const color = scoreColor(clamp);
  const failAngle = scoreToAngle(ZONE_FAIL);
  const warnAngle = scoreToAngle(ZONE_WARN);
  const scoreAngle = scoreToAngle(clamp);

  const cx = size / 2;

  // ── Mini variant ────────────────────────────────────────────────────────────
  // cy is at the bottom of the SVG so only the upper half of the circle shows.
  // A small score number sits inside the arc opening.
  if (mini) {
    const sw = Math.max(3, Math.round(size * 0.10));
    const r = size / 2 - sw - 2;
    // vh: arc top stroke edge + arc height; cy sits just below this.
    const vh = r + sw / 2 + 2;
    const cy = vh + 1; // just outside the viewport bottom — keeps arc visible

    return (
      <div className={cn("flex flex-col items-center", className)}>
        <svg width={size} height={vh} viewBox={`0 0 ${size} ${vh}`}>
          {/* Background zones */}
          <path d={arcPath(cx, cy, r, GAUGE_START, failAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" opacity={0.2} />
          <path d={arcPath(cx, cy, r, failAngle, warnAngle)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" opacity={0.2} />
          <path d={arcPath(cx, cy, r, warnAngle, GAUGE_END)} fill="none" stroke="#10b981" strokeWidth={sw} strokeLinecap="butt" opacity={0.2} />
          {/* Score fill */}
          {clamp > 0 && clamp <= ZONE_FAIL && (
            <path d={arcPath(cx, cy, r, GAUGE_START, scoreAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="round" />
          )}
          {clamp > ZONE_FAIL && clamp <= ZONE_WARN && (
            <>
              <path d={arcPath(cx, cy, r, GAUGE_START, failAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" />
              <path d={arcPath(cx, cy, r, failAngle, scoreAngle)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="round" />
            </>
          )}
          {clamp > ZONE_WARN && (
            <>
              <path d={arcPath(cx, cy, r, GAUGE_START, failAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" />
              <path d={arcPath(cx, cy, r, failAngle, warnAngle)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" />
              <path d={arcPath(cx, cy, r, warnAngle, scoreAngle)} fill="none" stroke="#10b981" strokeWidth={sw} strokeLinecap="round" />
            </>
          )}
          {/* Score text inside arc opening */}
          <text
            x={cx}
            y={vh * 0.72}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.round(size * 0.28)}
            fontWeight="800"
            fill={color}
          >
            {clamp}
          </text>
        </svg>
      </div>
    );
  }

  // ── Full variant ─────────────────────────────────────────────────────────────
  // Geometry:
  //   sw  = stroke width (thicker = more prominent arc)
  //   r   = radius — constrained so arc fits horizontally within vw
  //   padH = horizontal clearance so arc endpoints don't clip at edges
  //   cy  = arc center; placed so it's just barely outside the SVG bottom
  //   vh  = SVG height = arc top stroke edge to arc horizontal midpoint
  //         (we show roughly the top 60% of the circle)
  //
  const padH = Math.round(size * 0.06);
  const sw = Math.round(size * 0.085);
  const r = size / 2 - padH - sw / 2;

  // Show the arc from its topmost point down to ~35% of r below center.
  // This gives room for text inside the opening without showing the flat bottom.
  const visibleDepth = Math.round(r * 0.50); // how far below cy is visible
  const vh = r + sw / 2 + Math.round(size * 0.04) + visibleDepth;
  const cy = vh - visibleDepth; // center is `visibleDepth` above SVG bottom

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg
        width={size}
        height={vh}
        viewBox={`0 0 ${size} ${vh}`}
        aria-label={`Health score ${score} out of 100, Grade ${grade}`}
      >
        {/* Background zone tracks */}
        <path d={arcPath(cx, cy, r, GAUGE_START, failAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" opacity={0.15} />
        <path d={arcPath(cx, cy, r, failAngle, warnAngle)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" opacity={0.15} />
        <path d={arcPath(cx, cy, r, warnAngle, GAUGE_END)} fill="none" stroke="#10b981" strokeWidth={sw} strokeLinecap="butt" opacity={0.15} />

        {/* Zone boundary ticks */}
        {[ZONE_FAIL, ZONE_WARN].map((s) => {
          const a = scoreToAngle(s);
          const inner = polarToCartesian(cx, cy, r - sw / 2 - 1, a);
          const outer = polarToCartesian(cx, cy, r + sw / 2 + 1, a);
          return (
            <line key={s} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="white" strokeWidth={2.5} opacity={0.6} />
          );
        })}

        {/* Score fill arcs */}
        {clamp > 0 && clamp <= ZONE_FAIL && (
          <path d={arcPath(cx, cy, r, GAUGE_START, scoreAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="round" />
        )}
        {clamp > ZONE_FAIL && clamp <= ZONE_WARN && (
          <>
            <path d={arcPath(cx, cy, r, GAUGE_START, failAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" />
            <path d={arcPath(cx, cy, r, failAngle, scoreAngle)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="round" />
          </>
        )}
        {clamp > ZONE_WARN && (
          <>
            <path d={arcPath(cx, cy, r, GAUGE_START, failAngle)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" />
            <path d={arcPath(cx, cy, r, failAngle, warnAngle)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" />
            <path d={arcPath(cx, cy, r, warnAngle, scoreAngle)} fill="none" stroke="#10b981" strokeWidth={sw} strokeLinecap="round" />
          </>
        )}

        {/* Score number — centered inside the arc opening, well above cy */}
        <text
          x={cx}
          y={cy - r * 0.32}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.round(size * 0.21)}
          fontWeight="800"
          fill={color}
          letterSpacing="-1"
        >
          {clamp}
        </text>
        {/* /100 subscript */}
        <text
          x={cx}
          y={cy - r * 0.32 + Math.round(size * 0.125)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.round(size * 0.065)}
          fill="currentColor"
          opacity={0.35}
        >
          / 100
        </text>
      </svg>

      {/* Grade label — HTML below SVG, zero overlap risk */}
      <div className="text-center -mt-1">
        <p className="text-sm font-semibold" style={{ color }}>
          Grade {grade} — {getGradeLabel(grade)}
        </p>
      </div>

      {/* Zone labels */}
      <div className="flex justify-between w-full px-1">
        <span className="text-[11px] font-medium text-red-500/60">Critical</span>
        <span className="text-[11px] font-medium text-amber-500/60">Caution</span>
        <span className="text-[11px] font-medium text-emerald-500/60">Healthy</span>
      </div>
    </div>
  );
}
