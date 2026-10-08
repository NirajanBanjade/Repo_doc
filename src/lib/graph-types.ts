export type RepoFile = { path: string; size: number; lang: "js" | "py" | "other" };
export type RepoGraph = {
  owner: string;
  repo: string;
  ref: string;
  files: RepoFile[];
  edges: [number, number][]; // [fromIndex imports toIndex]
  truncated: boolean;
  analyzedAt: number;
};

export type Selection = { type: "file" | "folder"; path: string } | null;

export function buildIndex(g: RepoGraph) {
  const n = g.files.length;
  const out: number[][] = Array.from({ length: n }, () => []);
  const inc: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of g.edges) {
    out[a]!.push(b);
    inc[b]!.push(a);
  }
  const byPath = new Map(g.files.map((f, i) => [f.path, i]));
  return { out, inc, byPath };
}
export type GraphIndex = ReturnType<typeof buildIndex>;

export function seedsFor(g: RepoGraph, idx: GraphIndex, sel: Selection): number[] {
  if (!sel) return [];
  if (sel.type === "file") {
    const i = idx.byPath.get(sel.path);
    return i === undefined ? [] : [i];
  }
  const prefix = sel.path ? sel.path + "/" : "";
  return g.files.flatMap((f, i) => (f.path.startsWith(prefix) ? [i] : []));
}

/** Files that (transitively) import any seed, mapped to hop distance. */
export function impactOf(idx: GraphIndex, seeds: number[], depth: number) {
  const seen = new Map<number, number>();
  const seedSet = new Set(seeds);
  let frontier = seeds;
  for (let hop = 1; hop <= depth && frontier.length; hop++) {
    const next: number[] = [];
    for (const s of frontier)
      for (const p of idx.inc[s]!)
        if (!seedSet.has(p) && !seen.has(p)) {
          seen.set(p, hop);
          next.push(p);
        }
    frontier = next;
  }
  return seen;
}

export function depsOf(idx: GraphIndex, seeds: number[]) {
  const seedSet = new Set(seeds);
  const s = new Set<number>();
  for (const x of seeds) for (const d of idx.out[x]!) if (!seedSet.has(d)) s.add(d);
  return [...s];
}

export function dirOf(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}
export function baseName(p: string) {
  return p.slice(p.lastIndexOf("/") + 1) || p;
}
