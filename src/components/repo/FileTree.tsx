import { useMemo, useState } from "react";
import { ChevronRight, FileCode2, FileText, Folder, Search } from "lucide-react";
import type { RepoGraph, Selection } from "@/lib/graph-types";
import { cn } from "@/lib/utils";

type TNode = { name: string; path: string; children: Map<string, TNode>; file?: boolean };

function build(paths: string[]) {
  const root: TNode = { name: "", path: "", children: new Map() };
  for (const p of paths) {
    const parts = p.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (!cur.children.has(part)) cur.children.set(part, { name: part, path, children: new Map(), file: i === parts.length - 1 });
      cur = cur.children.get(part)!;
    });
  }
  return root;
}

export function FileTree({
  graph,
  selection,
  impacted,
  onSelect,
}: {
  graph: RepoGraph;
  selection: Selection;
  impacted: Set<string>;
  onSelect: (s: Selection) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const filtered = useMemo(
    () => graph.files.map((f) => f.path).filter((p) => !q || p.toLowerCase().includes(q.toLowerCase())),
    [graph, q],
  );
  const tree = useMemo(() => build(filtered), [filtered]);
  const toggle = (p: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const render = (n: TNode, depth: number): React.ReactNode =>
    [...n.children.values()]
      .sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name))
      .map((c) => {
        const isOpen = !!q || open.has(c.path);
        const active = selection?.path === c.path;
        const hit = impacted.has(c.path);
        return (
          <div key={c.path}>
            <button
              onClick={() => {
                if (!c.file) toggle(c.path);
                onSelect({ type: c.file ? "file" : "folder", path: c.path });
              }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-xs transition-colors hover:bg-muted",
                active && "bg-primary/15 text-primary",
                hit && !active && "text-hop-1",
              )}
              style={{ paddingLeft: 6 + depth * 12 }}
            >
              {c.file ? (
                <span className="w-3" />
              ) : (
                <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform duration-200", isOpen && "rotate-90")} />
              )}
              {c.file ? (
                /\.(tsx?|jsx?|py|mjs|cjs|vue|svelte)$/.test(c.name) ? (
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />
              )}
              <span className="truncate">{c.name}</span>
            </button>
            {!c.file && (
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">{isOpen && render(c, depth + 1)}</div>
              </div>
            )}
          </div>
        );
      });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search files"
          className="w-full bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex-1 overflow-auto p-1.5">{render(tree, 0)}</div>
    </div>
  );
}
