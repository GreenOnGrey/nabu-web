import { useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import { useTranslation } from "react-i18next";
import type { CommGraph } from "../../api/types";

const W = 760;
const H = 500;

type Placed = CommGraph["nodes"][number] & SimulationNodeDatum & { r: number };
export type Picked = { kind: "node"; id: string } | { kind: "edge"; a: string; b: string } | null;

const radius = (notes: number) => 7 + Math.sqrt(notes) * 3.2;

/** The graph of people and topics (R19, design §3.5): a node per tag sized by
 * its notes, an edge per pair that meets in a note. Hovering highlights the
 * neighbours, a click pins the selection; the wheel zooms, dragging moves.
 * The layout is computed once per answer of the server. */
export function Graph({ graph, picked, onPick }: { graph: CommGraph; picked: Picked; onPick: (p: Picked) => void }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const { nodes, byId } = useMemo(() => {
    const placed: Placed[] = graph.nodes.map((n) => ({ ...n, r: radius(n.notes) }));
    const index = new Map(placed.map((n) => [n.id, n]));
    const links = graph.edges.filter((e) => index.has(e.a) && index.has(e.b)).map((e) => ({ source: e.a, target: e.b, notes: e.notes }));
    const sim = forceSimulation(placed)
      .force("link", forceLink<Placed, (typeof links)[number]>(links).id((d) => d.id).distance(90).strength((l) => Math.min(1, 0.2 + l.notes * 0.08)))
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide<Placed>().radius((d) => d.r + 14))
      .stop();
    for (let i = 0; i < 260; i++) sim.tick();
    for (const n of placed) { // keep the labels inside the field
      n.x = Math.max(n.r + 30, Math.min(W - n.r - 30, n.x ?? W / 2));
      n.y = Math.max(n.r + 10, Math.min(H - n.r - 24, n.y ?? H / 2));
    }
    return { nodes: placed, byId: index };
  }, [graph]);

  const focus = hover ?? (picked?.kind === "node" ? picked.id : null);
  const near = useMemo(() => {
    const s = new Set<string>();
    if (picked?.kind === "edge" && !hover) { s.add(picked.a); s.add(picked.b); return s; }
    if (!focus) return s;
    s.add(focus);
    for (const e of graph.edges) {
      if (e.a === focus) s.add(e.b);
      if (e.b === focus) s.add(e.a);
    }
    return s;
  }, [focus, picked, hover, graph]);
  const dimmed = near.size > 0;
  const edgeOn = (e: CommGraph["edges"][number]) =>
    picked?.kind === "edge" && !hover ? (picked.a === e.a && picked.b === e.b) : focus !== null && (e.a === focus || e.b === focus);

  const zoom = (factor: number) => setView((v) => {
    const k = Math.max(0.5, Math.min(4, v.k * factor));
    // keep the centre of the field in place
    return { k, x: W / 2 - ((W / 2 - v.x) / v.k) * k, y: H / 2 - ((H / 2 - v.y) / v.k) * k };
  });

  return (
    <div className="gwrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("comm.graph.aria")} className={dimmed ? "dimmed" : undefined}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        onPointerDown={(e) => { if (e.target === e.currentTarget) { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const box = e.currentTarget.getBoundingClientRect();
          const dx = ((e.clientX - drag.current.x) / box.width) * W;
          const dy = ((e.clientY - drag.current.y) / box.height) * H;
          drag.current = { x: e.clientX, y: e.clientY };
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onClick={(e) => { if (e.target === e.currentTarget) onPick(null); }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {graph.edges.map((e) => {
            const a = byId.get(e.a), b = byId.get(e.b);
            if (!a || !b) return null;
            return (
              <g key={`${e.a}-${e.b}`} className={`g-e${edgeOn(e) ? " hl" : ""}`} onClick={() => onPick({ kind: "edge", a: e.a, b: e.b })}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1 + e.notes * 0.5} />
                <line className="hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              </g>
            );
          })}
          {nodes.map((n) => {
            const pinned = picked?.kind === "node" && picked.id === n.id;
            return (
              <g key={n.id} className={`g-n ${n.kind === "person" ? "p" : "t"}${n.notes < 5 ? " small" : ""}${near.has(n.id) ? " hl" : ""}${pinned ? " pin" : ""}`}
                tabIndex={0} role="button" aria-pressed={pinned} aria-label={t("comm.graph.node", { label: n.label, count: n.notes })}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                onClick={() => onPick(pinned ? null : { kind: "node", id: n.id })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(pinned ? null : { kind: "node", id: n.id }); } }}>
                <circle cx={n.x} cy={n.y} r={n.r} />
                <text x={n.x} y={(n.y ?? 0) + n.r + 14}>{n.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="gleg"><span><i className="p" />{t("comm.people")}</span><span><i className="tp" />{t("comm.topics")}</span></div>
      <div className="gzoom">
        <button type="button" onClick={() => zoom(1.3)} aria-label={t("comm.graph.zoomIn")}>+</button>
        <button type="button" onClick={() => zoom(1 / 1.3)} aria-label={t("comm.graph.zoomOut")}>−</button>
      </div>
    </div>
  );
}
