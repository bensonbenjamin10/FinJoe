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

// Gauge arc: -180° (left) → 0° (right), score 0→100 maps linearly
const GAUGE_START = -180;
const GAUGE_END = 0;
const GAUGE_RANGE = 180;
const ZONE_FAIL = 40;
const ZONE_WARN = 70;

function scoreToAngle(s: number) {
  return GAUGE_START + (s / 100) * GAUGE_RANGE;
}

function scoreColor(score: number) {
  return score >= ZONE_WARN ? "#10b981" : score >= ZONE_FAIL ? "#f59e0b" : "#ef4444";
}

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

  // ── Mini variant (header pill preview) ─────────────────────────────────────
  if (mini) {
    const sw = Math.max(4, Math.round(size * 0.11));
    const r = size / 2 - sw;
    const cx = size / 2;
    // Only show upper half: vh = radius + stroke overhang + small bottom padding
    const vh = r + sw + 4;
    const cy = vh; // center is at bottom edge of viewport so only upper half shows

    return (
      <div className={cn("flex flex-col items-center", className)}>
        <svg width={size} height={vh} viewBox={`0 0 ${size} ${vh}`}>
          {/* Background zones */}
          <path d={arcPath(cx, cy, r, GAUGE_START, scoreToAngle(ZONE_FAIL))} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
          <path d={arcPath(cx, cy, r, scoreToAngle(ZONE_FAIL), scoreToAngle(ZONE_WARN))} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
          <path d={arcPath(cx, cy, r, scoreToAngle(ZONE_WARN), GAUGE_END)} fill="none" stroke="#10b981" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
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
          {/* Score number centered inside arc */}
          <text
            x={cx}
            y={cy - r * 0.38}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.round(size * 0.3)}
            fontWeight="800"
            fill={color}
          >
            {clamp}
          </text>
        </svg>
      </div>
    );
  }

  // ── Full variant ────────────────────────────────────────────────────────────
  //
  // Geometry (all derived from `size`):
  //   padTop   = space above arc top stroke edge
  //   sw       = stroke width
  //   r        = arc radius
  //   cy       = arc center y  →  arc top pixel = cy - r - sw/2 = padTop  ✓
  //   textGap  = height below cy for score + grade text
  //   vh       = total SVG height
  //
  const sw = Math.round(size * 0.075);
  const r = Math.round(size * 0.40);
  const padTop = Math.round(size * 0.10);
  const cy = padTop + r + Math.ceil(sw / 2);
  const cx = size / 2;
  const textGap = Math.round(size * 0.30);
  const vh = cy + textGap;

  // Needle: points from hub (cx,cy) upward into arc at scoreAngle
  const needleLen = r * 0.78;
  const hubR = sw * 0.55;
  const tip = polarToCartesian(cx, cy, needleLen, scoreAngle);
  const b1 = polarToCartesian(cx, cy, hubR * 0.8, scoreAngle + 90);
  const b2 = polarToCartesian(cx, cy, hubR * 0.8, scoreAngle - 90);

  // Text positions — all BELOW cy, so needle never overlaps
  const scoreY = cy + Math.round(size * 0.06);
  const slashY = cy + Math.round(size * 0.14);
  const gradeY = cy + Math.round(size * 0.22);

  const fs_score = Math.round(size * 0.20);
  const fs_slash = Math.round(size * 0.07);
  const fs_grade = Math.round(size * 0.08);

  return (
    <div className={cn("flex flex-col items-center", className)}>
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
          return <line key={s} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="white" strokeWidth={2} opacity={0.5} />;
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

        {/* Needle */}
        <polygon points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill={color} opacity={0.85} />
        <circle cx={cx} cy={cy} r={hubR} fill={color} />
        <circle cx={cx} cy={cy} r={hubR * 0.45} fill="white" opacity={0.6} />

        {/* Score number — below cy */}
        <text x={cx} y={scoreY} textAnchor="middle" dominantBaseline="middle" fontSize={fs_score} fontWeight="800" fill={color}>
          {clamp}
        </text>
        {/* / 100 */}
        <text x={cx} y={slashY} textAnchor="middle" dominantBaseline="middle" fontSize={fs_slash} fill="currentColor" opacity={0.4}>
          / 100
        </text>
        {/* Grade + label */}
        <text x={cx} y={gradeY} textAnchor="middle" dominantBaseline="middle" fontSize={fs_grade} fontWeight="600" fill={color} opacity={0.85}>
          Grade {grade} — {getGradeLabel(grade)}
        </text>
      </svg>

      {/* Zone labels below SVG — no overflow risk */}
      <div className="flex justify-between w-full px-2 -mt-1">
        <span className="text-[11px] font-medium text-red-500/70">Critical</span>
        <span className="text-[11px] font-medium text-amber-500/70">Caution</span>
        <span className="text-[11px] font-medium text-emerald-500/70">Healthy</span>
      </div>
    </div>
  );
}
