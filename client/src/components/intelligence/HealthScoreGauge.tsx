import { cn } from "@/lib/utils";

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

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

/**
 * Converts polar coordinates (angle in degrees, radius) to SVG x,y.
 * 0° = right, 90° = top (SVG y is inverted), 180° = left.
 */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * Builds an SVG arc path string for a segment between startAngle and endAngle.
 * The arc lives in the upper half (180° → 0°, left to right).
 */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// The gauge spans from -180° (left) to 0° (right) = 180° total arc, opened at the bottom.
// In our coordinate system: startAngle = -180, endAngle = 0
// But we map score 0→100 to -180°→0° of the arc.
const GAUGE_START = -180; // left end
const GAUGE_END = 0;      // right end
const GAUGE_RANGE = GAUGE_END - GAUGE_START; // 180°

// Zone boundaries (score-based)
const ZONE_FAIL_END = 40;   // 0–40 = red
const ZONE_WARN_END = 70;   // 40–70 = amber
// 70–100 = green

export function HealthScoreGauge({
  score,
  grade,
  size = 200,
  mini = false,
  className,
}: {
  score: number;
  grade: string;
  size?: number;
  mini?: boolean;
  className?: string;
}) {
  // SVG viewport: full width, roughly 55% height (only upper half + padding for text)
  const vw = size;
  const vh = Math.round(size * 0.62);
  const cx = vw / 2;
  const cy = Math.round(vh * 0.78); // arc center pushed toward bottom of viewport
  const strokeWidth = mini ? Math.round(size * 0.10) : Math.round(size * 0.08);
  const r = (size / 2) - strokeWidth - (mini ? 2 : 4);

  const clampedScore = Math.min(100, Math.max(0, score));

  // Convert score to angle
  function scoreToAngle(s: number) {
    return GAUGE_START + (s / 100) * GAUGE_RANGE;
  }

  const scoreAngle = scoreToAngle(clampedScore);

  // Zone arc boundaries
  const failEndAngle = scoreToAngle(ZONE_FAIL_END);
  const warnEndAngle = scoreToAngle(ZONE_WARN_END);

  // Needle tip
  const needleTip = polarToCartesian(cx, cy, r * 0.72, scoreAngle);
  const needleBase1 = polarToCartesian(cx, cy, strokeWidth * 0.5, scoreAngle + 90);
  const needleBase2 = polarToCartesian(cx, cy, strokeWidth * 0.5, scoreAngle - 90);

  // Background track segments (colored zones)
  const trackOpacity = "0.18";

  if (mini) {
    // Mini version: just a compact arc + score number, no needle or text labels
    const miniVh = Math.round(size * 0.65);
    const miniCy = Math.round(miniVh * 0.80);
    const miniR = (size / 2) - strokeWidth - 2;
    const miniScoreAngle = scoreToAngle(clampedScore);
    const miniFailEnd = scoreToAngle(ZONE_FAIL_END);
    const miniWarnEnd = scoreToAngle(ZONE_WARN_END);

    return (
      <div className={cn("flex flex-col items-center", className)}>
        <svg width={size} height={miniVh} viewBox={`0 0 ${size} ${miniVh}`}>
          {/* Background zone tracks */}
          <path d={arcPath(cx, miniCy, miniR, GAUGE_START, miniFailEnd)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="butt" opacity={trackOpacity} />
          <path d={arcPath(cx, miniCy, miniR, miniFailEnd, miniWarnEnd)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="butt" opacity={trackOpacity} />
          <path d={arcPath(cx, miniCy, miniR, miniWarnEnd, GAUGE_END)} fill="none" stroke="#10b981" strokeWidth={strokeWidth} strokeLinecap="butt" opacity={trackOpacity} />
          {/* Score fill */}
          {clampedScore > 0 && clampedScore <= ZONE_FAIL_END && (
            <path d={arcPath(cx, miniCy, miniR, GAUGE_START, miniScoreAngle)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="round" />
          )}
          {clampedScore > ZONE_FAIL_END && clampedScore <= ZONE_WARN_END && (
            <>
              <path d={arcPath(cx, miniCy, miniR, GAUGE_START, miniFailEnd)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="butt" />
              <path d={arcPath(cx, miniCy, miniR, miniFailEnd, miniScoreAngle)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="round" />
            </>
          )}
          {clampedScore > ZONE_WARN_END && (
            <>
              <path d={arcPath(cx, miniCy, miniR, GAUGE_START, miniFailEnd)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="butt" />
              <path d={arcPath(cx, miniCy, miniR, miniFailEnd, miniWarnEnd)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="butt" />
              <path d={arcPath(cx, miniCy, miniR, miniWarnEnd, miniScoreAngle)} fill="none" stroke="#10b981" strokeWidth={strokeWidth} strokeLinecap="round" />
            </>
          )}
          {/* Score text centered in arc */}
          <text
            x={cx}
            y={miniCy - miniR * 0.15}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.round(size * 0.26)}
            fontWeight="700"
            fill={clampedScore >= 70 ? "#10b981" : clampedScore >= 40 ? "#f59e0b" : "#ef4444"}
          >
            {clampedScore}
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`} aria-label={`Health score ${score} out of 100, Grade ${grade}`}>
        {/* Background zone tracks */}
        <path d={arcPath(cx, cy, r, GAUGE_START, failEndAngle)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="butt" opacity={trackOpacity} />
        <path d={arcPath(cx, cy, r, failEndAngle, warnEndAngle)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="butt" opacity={trackOpacity} />
        <path d={arcPath(cx, cy, r, warnEndAngle, GAUGE_END)} fill="none" stroke="#10b981" strokeWidth={strokeWidth} strokeLinecap="butt" opacity={trackOpacity} />

        {/* Zone boundary ticks */}
        {[ZONE_FAIL_END, ZONE_WARN_END].map((s) => {
          const angle = scoreToAngle(s);
          const inner = polarToCartesian(cx, cy, r - strokeWidth / 2 - 2, angle);
          const outer = polarToCartesian(cx, cy, r + strokeWidth / 2 + 2, angle);
          return <line key={s} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="currentColor" strokeWidth={1.5} className="text-background" opacity={0.7} />;
        })}

        {/* Score fill arcs (multi-color, stops at score) */}
        {clampedScore > 0 && clampedScore <= ZONE_FAIL_END && (
          <path d={arcPath(cx, cy, r, GAUGE_START, scoreAngle)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
        {clampedScore > ZONE_FAIL_END && clampedScore <= ZONE_WARN_END && (
          <>
            <path d={arcPath(cx, cy, r, GAUGE_START, failEndAngle)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="butt" />
            <path d={arcPath(cx, cy, r, failEndAngle, scoreAngle)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        )}
        {clampedScore > ZONE_WARN_END && (
          <>
            <path d={arcPath(cx, cy, r, GAUGE_START, failEndAngle)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} strokeLinecap="butt" />
            <path d={arcPath(cx, cy, r, failEndAngle, warnEndAngle)} fill="none" stroke="#f59e0b" strokeWidth={strokeWidth} strokeLinecap="butt" />
            <path d={arcPath(cx, cy, r, warnEndAngle, scoreAngle)} fill="none" stroke="#10b981" strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        )}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={clampedScore >= 70 ? "#10b981" : clampedScore >= 40 ? "#f59e0b" : "#ef4444"}
          opacity={0.9}
        />
        {/* Needle hub */}
        <circle cx={cx} cy={cy} r={strokeWidth * 0.55} fill={clampedScore >= 70 ? "#10b981" : clampedScore >= 40 ? "#f59e0b" : "#ef4444"} />
        <circle cx={cx} cy={cy} r={strokeWidth * 0.28} fill="white" opacity={0.6} />

        {/* Zone labels */}
        {(() => {
          const redMid = polarToCartesian(cx, cy, r + strokeWidth + 10, scoreToAngle(20));
          const ambMid = polarToCartesian(cx, cy, r + strokeWidth + 10, scoreToAngle(55));
          const greMid = polarToCartesian(cx, cy, r + strokeWidth + 10, scoreToAngle(85));
          const fs = Math.round(size * 0.055);
          return (
            <>
              <text x={redMid.x} y={redMid.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill="#ef4444" opacity={0.7} fontWeight="500">Critical</text>
              <text x={ambMid.x} y={ambMid.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill="#f59e0b" opacity={0.7} fontWeight="500">Caution</text>
              <text x={greMid.x} y={greMid.y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill="#10b981" opacity={0.7} fontWeight="500">Healthy</text>
            </>
          );
        })()}

        {/* Score number */}
        <text
          x={cx}
          y={cy - r * 0.22}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.round(size * 0.22)}
          fontWeight="800"
          fill={clampedScore >= 70 ? "#10b981" : clampedScore >= 40 ? "#f59e0b" : "#ef4444"}
        >
          {clampedScore}
        </text>
        <text
          x={cx}
          y={cy - r * 0.22 + Math.round(size * 0.135)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.round(size * 0.075)}
          fill="currentColor"
          opacity={0.45}
        >
          / 100
        </text>

        {/* Grade + label */}
        <text
          x={cx}
          y={cy + Math.round(size * 0.04)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={Math.round(size * 0.09)}
          fontWeight="700"
          fill={clampedScore >= 70 ? "#10b981" : clampedScore >= 40 ? "#f59e0b" : "#ef4444"}
        >
          Grade {grade} — {getGradeLabel(grade)}
        </text>
      </svg>
    </div>
  );
}
