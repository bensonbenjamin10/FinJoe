import { useEffect, useState } from "react";
import logoImage from "@assets/finjoe-logo.png";

const MESSAGES = [
  "Fetching your finance…",
  "Analyzing transactions…",
  "Building your insights…",
] as const;

export function SplashScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6"
      role="status"
      aria-live="polite"
      aria-label="Loading FinJoe"
    >
      <div className="flex flex-col items-center gap-10 max-w-md w-full">
        <img
          src={logoImage}
          alt="FinJoe"
          className="h-24 w-auto sm:h-28 drop-shadow-sm"
          width={224}
          height={224}
          decoding="async"
        />
        <div className="w-full space-y-4 text-center">
          <p
            key={messageIndex}
            className="min-h-[1.5rem] text-sm font-medium text-muted-foreground sm:text-base"
            style={{ animation: "splash-fade-in 0.35s ease-out" }}
          >
            {MESSAGES[messageIndex]}
          </p>
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary"
              style={{
                animation: "splash-progress 1.2s ease-in-out infinite",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground/80">Finance Joe is getting things ready</p>
        </div>
      </div>
    </div>
  );
}
