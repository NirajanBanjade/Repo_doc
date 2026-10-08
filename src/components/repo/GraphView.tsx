import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import { FileCode2, Folder } from "lucide-react";
import { baseName, dirOf, type GraphIndex, type RepoGraph, type Selection } from "@/lib/graph-types";
import { cn } from "@/lib/utils";

type NData = {
  label: string;
  sub?: string | undefined;
  kind: "center" | "dep" | "hop" | "folder";
  hop?: number | undefined;
  delay: number;
  folder?: boolean;
};

const HOP_CLS = ["", "border-hop-1 text-hop-1", "border-hop-2 text-hop-2", "border-hop-3 text-hop-3"];

function MapNode({ data }: NodeProps<Node<NData>>) {
  const Icon = data.folder ? Folder : FileCode2;
  const tone =
    data.kind === "center"
      ? "border-primary bg-primary text-primary-foreground pulse-ring"
      : data.kind === "dep"
        ? "border-dep text-dep bg-card"
        : data.kind === "hop"
          ? cn("bg-card", HOP_CLS[Math.min(data.hop ?? 1, 3)])
          : "border-border bg-card text-foreground hover:border-primary";
  return (
    <div
      className={cn(
        "node-in w-[200px] cursor-pointer rounded-md border px-3 py-2 shadow-lg transition-colors",
        tone,
      )}
      style={{ animationDelay: `${data.delay}ms` }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-primary/60" />
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
        <span className="truncate font-mono text-xs font-semibold">{data.label}</span>
      </div>
      {data.sub && (
        <div className={cn("mt-0.5 truncate font-mono text-[10px]", data.kind === "center" ? "opacity-80" : "text-muted-foreground")}>
          {data.sub}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-primary/60" />
    </div>
  );
}
const nodeTypes = { map: MapNode };

const bucketOf = (p: string) => {
  const d = dirOf(p);
  if (!d) return "";
  return d.split("/").slice(0, 2).join("/");
};

function overview(g: RepoGraph) {
  const buckets = new Map<string, number>();
  g.files.forEach((f) => {
    const b = bucketOf(f.path);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  });
  const w = new Map<string, number>();
  for (const [a, b] of g.edges) {
    const x = bucketOf(g.files[a]!.path);
    const y = bucketOf(g.files[b]!.path);
    if (x !== y) w.set(x + "→" + y, (w.get(x + "→" + y) ?? 0) + 1);
  }
  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: "LR", nodesep: 18, ranksep: 90 });
  dg.setDefaultEdgeLabel(() => ({}));
  for (const b of buckets.keys()) dg.setNode(b || "/", { width: 200, height: 46 });
  for (const k of w.keys()) {
    const [x = "", y = ""] = k.split("→");
    dg.setEdge(x || "/", y || "/");
  }
  dagre.layout(dg);
  const nodes: Node<NData>[] = [...buckets].map(([b, count], i) => {
    const n = dg.node(b || "/");
    return {
      id: "b:" + b,
      type: "map",
      position: { x: n.x - 100, y: n.y - 23 },
      data: { label: b || "(root)", sub: `${count} files`, kind: "folder", folder: true, delay: Math.min(i * 12, 600) },
    };
  });
  const edges: Edge[] = [...w].map(([k, c]) => {
    const [x = "", y = ""] = k.split("→");
    return {
      id: k,
      source: "b:" + x,
      target: "b:" + y,
      style: { stroke: "var(--primary)", strokeOpacity: 0.35, strokeWidth: Math.min(1 + Math.log2(c), 4) },
    };
  });
  return { nodes, edges };
}

const COL_W = 280;
const ROW_H = 58;
const PER_COL = 40;

function focus(g: RepoGraph, idx: GraphIndex, sel: NonNullable<Selection>, seeds: number[], deps: number[], impact: Map<number, number>) {
  const nodes: Node<NData>[] = [];
  const edges: Edge[] = [];
  const pos = new Map<number, string>();
  const place = (col: number, items: number[], mk: (i: number) => Omit<NData, "delay">, hop: number) => {
    const shown = items.slice(0, PER_COL);
    const h = shown.length * ROW_H;
    shown.forEach((fi, r) => {
      const id = "f:" + fi;
      pos.set(fi, id);
      nodes.push({
        id,
        type: "map",
        position: { x: col * COL_W, y: r * ROW_H - h / 2 },
        data: { ...mk(fi), delay: Math.abs(hop) * 160 + r * 15 },
      });
    });
    if (items.length > PER_COL)
      nodes.push({
        id: `more:${col}`,
        type: "map",
        position: { x: col * COL_W, y: h / 2 + 10 },
        data: { label: `+${items.length - PER_COL} more`, kind: "folder", delay: Math.abs(hop) * 160 + 400 },
        selectable: false,
      });
  };
  const fileData = (fi: number, kind: NData["kind"], hop?: number) => ({
    label: baseName(g.files[fi]!.path),
    sub: dirOf(g.files[fi]!.path) || "/",
    kind,
    hop,
  });

  // Center
  if (sel.type === "file") place(0, seeds, (fi) => fileData(fi, "center"), 0);
  else {
    nodes.push({
      id: "center",
      type: "map",
      position: { x: 0, y: -23 },
      data: { label: sel.path || "(root)", sub: `${seeds.length} files`, kind: "center", folder: true, delay: 0 },
    });
    seeds.forEach((s) => pos.set(s, "center"));
  }
  place(-1, deps, (fi) => fileData(fi, "dep"), 1);
  const maxHop = Math.max(0, ...impact.values());
  for (let h = 1; h <= maxHop; h++) {
    const items = [...impact].filter(([, x]) => x === h).map(([i]) => i);
    place(h, items, (fi) => fileData(fi, "hop", h), h);
  }
  const seen = new Set<string>();
  const add = (a: number, b: number, color: string, animated: boolean) => {
    const s = pos.get(a);
    const t = pos.get(b);
    if (!s || !t || s === t) return;
    const id = s + ">" + t;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, source: s, target: t, animated, style: { stroke: color, strokeOpacity: 0.7 } });
  };
  // deps: center -> dep (center imports dep) drawn dep -> center visually left-to-right
  for (const s of seeds) for (const d of idx.out[s]!) if (deps.includes(d)) add(d, s, "var(--dep)", false);
  for (const [fi, h] of impact)
    for (const t of idx.out[fi]!) {
      const th = seeds.includes(t) ? 0 : impact.get(t);
      if (th === h - 1) add(t, fi, `var(--hop-${Math.min(h, 3)})`, true);
    }
  return { nodes, edges };
}

type Props = {
  graph: RepoGraph;
  index: GraphIndex;
  selection: Selection;
  seeds: number[];
  deps: number[];
  impact: Map<number, number>;
  onSelect: (s: Selection) => void;
};

function Inner(p: Props) {
  const { fitView } = useReactFlow();
  const { nodes, edges } = useMemo(
    () => (p.selection ? focus(p.graph, p.index, p.selection, p.seeds, p.deps, p.impact) : overview(p.graph)),
    [p.graph, p.index, p.selection, p.seeds, p.deps, p.impact],
  );
  useEffect(() => {
    const t = setTimeout(() => fitView({ duration: 650, padding: 0.2, maxZoom: 1.1 }), 40);
    return () => clearTimeout(t);
  }, [nodes, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      onlyRenderVisibleElements
      minZoom={0.05}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => {
        if (n.id.startsWith("b:")) p.onSelect({ type: "folder", path: n.id.slice(2) });
        else if (n.id.startsWith("f:")) p.onSelect({ type: "file", path: p.graph.files[Number(n.id.slice(2))]!.path });
      }}
      colorMode="dark"
    >
      <Background color="var(--grid)" gap={32} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable maskColor="color-mix(in oklab, var(--background) 70%, transparent)" nodeColor="var(--primary)" />
    </ReactFlow>
  );
}

export function GraphView(p: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...p} />
    </ReactFlowProvider>
  );
}
