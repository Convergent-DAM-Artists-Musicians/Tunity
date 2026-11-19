import type { PerformanceInsights } from "../../../back-end/performance-analyzer/src/types";
import type { RhythmEventView } from "./rhythm-review";

type Props = {
  category: "articulation" | "dynamics";
  insights: PerformanceInsights;
  events: RhythmEventView[];
  findings: {
    category?: string;
    expectedId?: string;
    message: string;
    confidence?: number;
  }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onListen?: (start: number, end: number) => void;
};
export function ExpressionReview({
  category,
  insights,
  events,
  findings,
  selectedId,
  onSelect,
  onListen,
}: Props) {
  const articulation = category === "articulation";
  const status = insights.categories.find((c) => c.id === category);
  const notes = events.filter((e) => e.kind === "note");
  const measurements = notes.flatMap((e) => {
    const n = insights.notes.find((n) => n.expectedId === e.expectedId);
    return n ? [n] : [];
  });
  const levels = measurements.map((n) => n.loudnessDb).sort((a, b) => a - b);
  const baseline = levels.length ? levels[Math.floor(levels.length / 2)] : 0;
  const selected = insights.notes.find((n) => n.expectedId === selectedId);
  const selectedFindings = findings.filter(
    (f) => f.category === category && f.expectedId === selectedId,
  );
  return (
    <section
      className="rr-expression"
      aria-label={`${articulation ? "Articulation" : "Dynamics"} review`}
    >
      <h4>
        {articulation
          ? "Articulation · how your notes connect"
          : "Dynamics · shape and contrast"}
      </h4>
      <p>
        {articulation
          ? "Inspect sounding length and the silence before the next detected note. A gap alone does not prove a tonguing mistake."
          : "Compare each note’s recorded level with the typical level in this measure. Loudness differences are not automatically mistakes."}
      </p>
      {status?.status !== "assessed" && (
        <div className="rr-targetNotice">
          <strong>
            {status?.status === "unavailable"
              ? "Assessment unavailable"
              : `No ${articulation ? "articulation" : "dynamics"} assessment for this recording`}
          </strong>
          <p>
            {status?.detail ??
              "Reviewed score targets are needed to assess this category."}{" "}
            Measurements below are observations, not a pass.
          </p>
        </div>
      )}
      <div className="rr-pitchTable">
        <table>
          <thead>
            <tr>
              <th>Beat</th>
              <th>Score target</th>
              <th>{articulation ? "Sounding length" : "Relative level"}</th>
              <th>{articulation ? "Gap after note" : "Recorded level"}</th>
              <th>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((e) => {
              const n = insights.notes.find(
                (n) => n.expectedId === e.expectedId,
              );
              const issues = findings.filter(
                (f) => f.category === category && f.expectedId === e.expectedId,
              );
              const targets = articulation
                ? n?.articulationTargets?.filter((t) =>
                    ["staccato", "tenuto", "slur to next note"].includes(t),
                  )
                : [
                    ...(n?.hairpinTargets ?? []),
                    ...(n?.articulationTargets?.includes("accent")
                      ? ["accent"]
                      : []),
                    ...(n?.dynamicsTargetDb !== undefined
                      ? [`${n.dynamicsTargetDb} dB score target`]
                      : []),
                  ];
              const delta = n ? n.loudnessDb - baseline : 0;
              return (
                <tr
                  key={e.expectedId}
                  data-selected={selectedId === e.expectedId}
                  data-flagged={issues.length > 0}
                >
                  <td>
                    <button
                      aria-label={`Inspect ${category} at beat ${e.beat}`}
                      aria-pressed={selectedId === e.expectedId}
                      onClick={() => onSelect(e.expectedId)}
                    >
                      {Number(e.beat.toFixed(3))}
                    </button>
                  </td>
                  <td>
                    {targets?.length
                      ? targets.join(" · ")
                      : status?.status === "assessed" && !n?.articulationTargets
                        ? "Targets unavailable in saved result; reanalyze"
                        : "No target supplied"}
                  </td>
                  <td>
                    {!n ? (
                      "Not matched"
                    ) : articulation ? (
                      <>
                        <div className="rr-durationTrack">
                          <span
                            style={{
                              width: `${Math.min(100, (n.durationRatio ?? 0) * 100)}%`,
                            }}
                          />
                        </div>
                        {n.durationRatio !== undefined
                          ? `${Math.round(n.durationRatio * 100)}% of written duration`
                          : `${(n.endSec - n.startSec).toFixed(2)}s sounding`}
                      </>
                    ) : (
                      <>
                        <div className="rr-levelTrack">
                          <span
                            style={{
                              left: `${50 + Math.min(0, Math.max(-50, delta * 2))}%`,
                              width: `${Math.min(50, Math.abs(delta) * 2)}%`,
                            }}
                          />
                        </div>
                        {Math.abs(delta).toFixed(1)} dB{" "}
                        {delta >= 0 ? "above" : "below"} typical
                      </>
                    )}
                  </td>
                  <td>
                    {!n
                      ? "—"
                      : articulation
                        ? n.gapAfterMs === undefined
                          ? "No following note"
                          : `${Math.round(n.gapAfterMs)} ms`
                        : `${n.loudnessDb.toFixed(1)} dBFS`}
                  </td>
                  <td>
                    {issues.length
                      ? issues.map((f) => f.message).join(" ")
                      : !n
                        ? "No reliable matched sound."
                        : status?.status === "assessed" && targets?.length
                          ? "No issue flagged for this target."
                          : "Measured only · not graded"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="rr-expressionDetail">
          <span className="rr-eyebrow">
            SELECTED NOTE · BEAT {Number(selected.beat.toFixed(3))}
          </span>
          <h4>
            {articulation ? "Connection and release" : "Loudness observation"}
          </h4>
          <p>
            {articulation
              ? `Sounding length: ${(selected.endSec - selected.startSec).toFixed(2)} seconds. ${selected.gapAfterMs === undefined ? "No following note detected." : `Then ${Math.round(selected.gapAfterMs)} milliseconds of silence before the next detected note.`}`
              : `${selected.loudnessDb.toFixed(1)} dBFS recorded level. ${Math.abs(selected.loudnessDb - baseline).toFixed(1)} dB ${selected.loudnessDb >= baseline ? "above" : "below"} this measure’s median note level.`}
          </p>
          {selectedFindings.map((f, i) => (
            <p className="rr-explanation" key={i}>
              {f.message}
              {f.confidence !== undefined && (
                <span>
                  {Math.round(f.confidence * 100)}% evidence · review suggested
                </span>
              )}
            </p>
          ))}
          <button
            className="rr-textButton"
            disabled={!onListen}
            onClick={() =>
              onListen?.(
                Math.max(0, selected.startSec - 0.2),
                selected.endSec + 0.2,
              )
            }
          >
            Listen to this note ↗
          </button>
          <p className="rr-muted">
            {articulation
              ? "Short gaps may be intentional. Assess the score marking and listen before correcting technique."
              : "Microphone distance and automatic gain affect this measurement. It cannot determine piano or forte from absolute amplitude."}
          </p>
        </div>
      )}
    </section>
  );
}
