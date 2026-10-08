import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Check, GitBranch, Loader2, Radar, RefreshCw } from "lucide-react";
import { analyzeRepoFn } from "@/lib/repo.functions";
import { buildIndex, depsOf, impactOf, seedsFor, type RepoGraph, type Selection } from "@/lib/graph-types";
import { readCached, writeCached } from "@/lib/repo-cache";
import { GraphView } from "@/components/repo/GraphView";
import { FileTree } from "@/components/repo/FileTree";
import { SidePanel } from "@/components/repo/SidePanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/repo/$owner/$name")({
  validateSearch: z.object({ branch: z.string().optional() }),
  head: ({ params }) => ({
    meta: [
      { title: `${params.owner}/${params.name} — Repo Impact Map` },
      { name: "description", content: `Dependency map and change impact for ${params.owner}/${params.name}.` },
      { property: "og:title", content: `${params.owner}/${params.name} — Repo Impact Map` },
      { property: "og:description", content: `Explore how files in ${params.owner}/${params.name} connect and what a change affects.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RepoPage,
});

const STEPS = ["Downloading repository", "Reading source files", "Resolving imports", "Drawing the map"];

function RepoPage() {
  const { owner, name } = Route.useParams();
  const { branch } = Route.useSearch();
  const analyze = useServerFn(analyzeRepoFn);
  const [graph, setGraph] = useState<RepoGraph | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [depth, setDepth] = useState(3);

  useEffect(() => {
    let alive = true;
    setError("");
    setSelection(null);
    if (nonce === 0) {
      const c = readCached(owner, name, branch);
      if (c) {
        setGraph(c);
        return;
      }
    }
    setGraph(null);
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600);
    analyze({ data: { owner, repo: name, branch } })
      .then((r) => {
        if (!alive) return;
        if (r.ok) {
          writeCached(r.graph, branch);
          setGraph(r.graph);
        } else setError(r.error);
      })
      .catch(() => alive && setError("Couldn't analyze this repository. Please try again."))
      .finally(() => clearInterval(t));
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [owner, name, branch, nonce, analyze]);

  const index = useMemo(() => (graph ? buildIndex(graph) : null), [graph]);
  const seeds = useMemo(() => (graph && index ? seedsFor(graph, index, selection) : []), [graph, index, selection]);
  const deps = useMemo(() => (index ? depsOf(index, seeds) : []), [index, seeds]);
  const impact = useMemo(() => (index ? impactOf(index, seeds, depth >= 10 ? 999 : depth) : new Map<number, number>()), [index, seeds, depth]);
  const impactedPaths = useMemo(() => new Set(graph ? [...impact.keys()].map((i) => graph.files[i]!.path) : []), [impact, graph]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Link to="/" className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
          <Radar className="h-4 w-4 text-primary" />
        </Link>
        <div className="font-mono text-sm">
          <span className="text-muted-foreground">{owner}/</span>
          <span className="font-semibold">{name}</span>
        </div>
        {graph && (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            <GitBranch className="h-3 w-3" /> {graph.ref}
          </span>
        )}
        {graph && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {graph.files.length} files · {graph.edges.length} links{graph.truncated && " · capped"}
          </span>
        )}
        <div className="ml-auto">
          {graph && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => setNonce((n) => n + 1)}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-analyze
            </Button>
          )}
        </div>
      </header>

      {error ? (
        <div className="blueprint-grid flex flex-1 items-center justify-center p-6">
          <div className="node-in max-w-md rounded-xl border bg-card p-6 text-center">
            <p className="font-semibold">Couldn't map this repo</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="secondary" asChild>
                <Link to="/">Back</Link>
              </Button>
              <Button onClick={() => setNonce((n) => n + 1)}>Try again</Button>
            </div>
          </div>
        </div>
      ) : !graph || !index ? (
        <div className="blueprint-grid flex flex-1 items-center justify-center">
          <div className="node-in w-80 rounded-xl border bg-card/80 p-6 backdrop-blur">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Mapping</div>
            <ul className="mt-4 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className={cn("flex items-center gap-3 text-sm transition-opacity duration-500", i > step && "opacity-30")}>
                  {i < step ? (
                    <Check className="h-4 w-4 text-dep" />
                  ) : i === step ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border" />
                  )}
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-64 shrink-0 border-r bg-sidebar">
            <FileTree graph={graph} selection={selection} impacted={impactedPaths} onSelect={setSelection} />
          </div>
          <div className="relative min-w-0 flex-1">
            <GraphView graph={graph} index={index} selection={selection} seeds={seeds} deps={deps} impact={impact} onSelect={setSelection} />
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-card/80 px-3 py-2 font-mono text-[11px] text-muted-foreground backdrop-blur">
              {selection ? (
                <span className="flex flex-wrap gap-3">
                  <Legend cls="bg-dep" label="uses" />
                  <Legend cls="bg-primary" label="selected" />
                  <Legend cls="bg-hop-1" label="hop 1" />
                  <Legend cls="bg-hop-2" label="hop 2" />
                  <Legend cls="bg-hop-3" label="hop 3+" />
                </span>
              ) : (
                "Overview: folders and how they import each other. Click one to trace its impact."
              )}
            </div>
          </div>
          <div
            className={cn(
              "shrink-0 overflow-hidden border-l bg-sidebar transition-[width] duration-300 ease-out",
              selection ? "w-[360px]" : "w-0",
            )}
          >
            {selection && (
              <div className="h-full w-[360px]">
                <SidePanel
                  graph={graph}
                  selection={selection}
                  seeds={seeds}
                  deps={deps}
                  impact={impact}
                  depth={depth}
                  setDepth={setDepth}
                  onSelect={setSelection}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", cls)} />
      {label}
    </span>
  );
}
