"use client";

import { useEffect, useRef, useState } from "react";

/** Renders MusicXML notation in the browser with OpenSheetMusicDisplay. */
export function ScoreView({ xml, label }: { xml?: string; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    const element = container.current;
    if (!element || !xml) return;
    let cancelled = false;
    element.innerHTML = "";
    void (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled) return;
        const osmd = new OpenSheetMusicDisplay(element, {
          autoResize: true, backend: "svg", drawTitle: false, drawComposer: false, drawPartNames: false,
          autoBeam: true, drawingParameters: "compacttight",
        });
        await osmd.load(xml);
        if (cancelled) return;
        osmd.render();
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => { cancelled = true; element.innerHTML = ""; };
  }, [xml]);
  if (!xml) return <p className="studio-muted">Notation preview is available for uncompressed MusicXML files.</p>;
  return (
    <figure className="studio-score" aria-label={label}>
      <div ref={container} />
      {state === "loading" && <p className="studio-muted" role="status">Engraving notation…</p>}
      {state === "failed" && <p className="studio-muted" role="alert">This notation could not be displayed, but the score can still be played and analyzed.</p>}
    </figure>
  );
}
