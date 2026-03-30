import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MockScreenSpec } from "@/lib/knowledge-base/types";

interface KbMockScreenProps {
  spec: MockScreenSpec;
}

function Wireframe({ spec }: KbMockScreenProps) {
  const { variant, highlight, caption } = spec;

  const ring = (key: string) =>
    highlight === key ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";

  const headerRing =
    highlight === "header" || highlight === "nav"
      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
      : "";

  return (
    <>
      <div className="flex gap-2">
        <div
          className={cn(
            "flex w-[22%] flex-col gap-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-background/80 p-2",
            ring("sidebar")
          )}
        >
          <div className="h-2 w-8 rounded bg-muted-foreground/20" />
          <div className="mt-1 space-y-1">
            <div className="h-1.5 w-full rounded bg-muted-foreground/15" />
            <div className="h-1.5 w-[80%] rounded bg-muted-foreground/15" />
            <div className="h-1.5 w-full rounded bg-primary/30" />
          </div>
          {variant === "finjoe" && (
            <div className="mt-2 space-y-1 border-t border-dashed pt-2">
              <div className="h-1 w-full rounded bg-muted-foreground/10" />
              <div className="h-1 w-full rounded bg-muted-foreground/10" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            className={cn(
              "flex h-7 items-center gap-2 rounded-md border border-dashed border-muted-foreground/25 bg-background/80 px-2",
              headerRing
            )}
          >
            <div className="h-2 w-2 rounded-full bg-muted-foreground/25" />
            <div className="h-1.5 flex-1 rounded bg-muted-foreground/15" />
            {highlight === "nav" && (
              <span className="text-[9px] font-medium uppercase tracking-wide text-primary">FinJoe</span>
            )}
          </div>

          <div
            className={cn(
              "min-h-[88px] flex-1 rounded-md border border-dashed border-muted-foreground/25 bg-background/90 p-2",
              highlight !== "settings" && ring("main")
            )}
          >
            <div className="mb-2 flex gap-1">
              <div className="h-1.5 w-12 rounded bg-muted-foreground/20" />
              <div className="h-1.5 w-8 rounded bg-muted-foreground/15" />
            </div>
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded bg-muted-foreground/12" />
              <div className="h-1.5 w-[92%] rounded bg-muted-foreground/12" />
              <div className="h-1.5 w-[78%] rounded bg-muted-foreground/12" />
            </div>
            {highlight === "settings" && (
              <div className={cn("mt-3 grid gap-1.5 border-t border-dashed pt-2", ring("settings"))}>
                <div className="h-6 rounded border border-muted-foreground/20 bg-muted/30" />
                <div className="h-6 rounded border border-muted-foreground/20 bg-muted/30" />
              </div>
            )}
          </div>
        </div>
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground leading-snug">{caption}</figcaption>
      )}
    </>
  );
}

export function KbMockScreen({ spec }: KbMockScreenProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const { imageSrc, imageAlt, caption } = spec;

  if (imageSrc && !imageFailed) {
    const alt = imageAlt ?? caption ?? "Product screenshot";
    return (
      <figure className="mx-auto max-w-lg rounded-lg border bg-muted/40 p-3 shadow-sm">
        <img
          src={imageSrc}
          alt={alt}
          className="max-h-[320px] w-full rounded-md border object-contain object-top bg-background"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
        {caption && (
          <figcaption className="mt-2 text-center text-xs text-muted-foreground leading-snug">{caption}</figcaption>
        )}
      </figure>
    );
  }

  if (imageSrc && imageFailed) {
    return (
      <figure className="mx-auto max-w-lg rounded-lg border bg-muted/40 p-3 shadow-sm" aria-hidden>
        <p className="mb-2 text-center text-xs text-muted-foreground">Screenshot unavailable—showing layout guide.</p>
        <Wireframe spec={spec} />
      </figure>
    );
  }

  return (
    <figure className="mx-auto max-w-lg rounded-lg border bg-muted/40 p-3 shadow-sm" aria-hidden>
      <Wireframe spec={spec} />
    </figure>
  );
}
