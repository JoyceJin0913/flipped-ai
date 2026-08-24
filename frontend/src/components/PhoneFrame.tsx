import { useEffect, useState, type ReactNode } from "react";

/**
 * Desktop preview shell from heart-scene-spark's latest App Mock.
 * Real phone-sized viewports stay full-bleed so the app remains usable as a PWA.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const [framed, setFramed] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateFrame = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const showFrame = width >= 620;

      setFramed(showFrame);
      if (showFrame) {
        setScale(Math.min(1, (width - 48) / 414, (height - 48) / 868));
      }
    };

    updateFrame();
    window.addEventListener("resize", updateFrame);
    return () => window.removeEventListener("resize", updateFrame);
  }, []);

  if (!framed) return <>{children}</>;

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%)] p-4">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <div className="relative" style={{ transform: `scale(${scale})`, transformOrigin: "center" }}>
        <div className="relative rounded-[3.2rem] bg-[#0b0709] p-[12px] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)]">
          <div className="pointer-events-none absolute inset-0 rounded-[3.2rem] ring-1 ring-inset ring-white/10" />
          <div
            className="relative h-[844px] w-[390px] overflow-hidden rounded-[2.6rem] bg-background"
            style={{ transform: "translateZ(0)" }}
          >
            <div className="pointer-events-none absolute left-1/2 top-2 z-[999] h-[26px] w-[104px] -translate-x-1/2 rounded-full bg-black" />
            <div className="h-full w-full overflow-y-auto overscroll-contain">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
