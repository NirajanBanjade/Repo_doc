import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { BookOpen, Loader2, Send, Square, Waves, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { RepoGraph, Selection } from "@/lib/graph-types";
import { cn } from "@/lib/utils";

type Props = {
  graph: RepoGraph;
  selection: NonNullable<Selection>;
  seeds: number[];
  deps: number[];
  impact: Map<number, number>;
  depth: number;
  setDepth: (n: number) => void;
  onSelect: (s: Selection) => void;
};

export function SidePanel(p: Props) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"impact" | "ai">("impact");
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    ctrl.current?.abort();
    setAnswer("");
    setBusy(false);
  }, [p.selection.path]);

  const byHop = new Map<number, string[]>();
  for (const [i, h] of p.impact) byHop.set(h, [...(byHop.get(h) ?? []), p.graph.files[i]!.path]);

  const ask = async (mode: "explain" | "impact" | "ask", question?: string) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setTab("ai");
    setAnswer("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: c.signal,
        body: JSON.stringify({
          owner: p.graph.owner,
          repo: p.graph.repo,
          ref: p.graph.ref,
          target: p.selection,
          dependencies: p.deps.slice(0, 80).map((i) => p.graph.files[i]!.path),
          impacted: [...p.impact].slice(0, 300).map(([i, hop]) => ({ path: p.graph.files[i]!.path, hop })),
          folderFiles: p.selection.type === "folder" ? p.seeds.slice(0, 300).map((i) => p.graph.files[i]!.path) : undefined,
          mode,
          question,
        }),
      });
      if (!res.ok || !res.body) {
        setAnswer(`⚠️ ${(await res.text()) || "AI request failed."}`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setAnswer((a) => a + chunk);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAnswer("⚠️ Couldn't reach the AI. Please try again.");
    } finally {
      if (ctrl.current === c) setBusy(false);
    }
  };

  return (
    <aside className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{p.selection.type}</div>
            <div className="mt-1 break-all font-mono text-sm font-semibold text-primary">{p.selection.path || "(root)"}</div>
          </div>
          <button onClick={() => p.onSelect(null)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="uses" value={p.deps.length} className="text-dep" />
          <Stat label="direct" value={byHop.get(1)?.length ?? 0} className="text-hop-1" />
          <Stat label="total impact" value={p.impact.size} className="text-hop-2" />
        </div>
        <div className="mt-4">
          <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>Ripple depth</span>
            <span className="text-foreground">{p.depth >= 10 ? "all" : `${p.depth} hops`}</span>
          </div>
          <Slider className="mt-2" min={1} max={10} step={1} value={[p.depth]} onValueChange={(v) => p.setDepth(v[0] ?? 3)} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1 gap-1.5" onClick={() => ask("explain")} disabled={busy}>
            <BookOpen className="h-3.5 w-3.5" /> Explain
          </Button>
          <Button size="sm" className="flex-1 gap-1.5" onClick={() => ask("impact")} disabled={busy}>
            <Waves className="h-3.5 w-3.5" /> What else changes?
          </Button>
        </div>
      </div>

      <div className="flex border-b font-mono text-xs">
        {(["impact", "ai"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("flex-1 py-2 transition-colors", tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "impact" ? "Impact list" : "AI assistant"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === "impact" ? (
          <div className="space-y-4">
            {p.deps.length > 0 && (
              <Group title="Depends on" tone="text-dep" items={p.deps.map((i) => p.graph.files[i]!.path)} onSelect={p.onSelect} />
            )}
            {[...byHop].sort((a, b) => a[0] - b[0]).map(([h, items]) => (
              <Group
                key={h}
                title={h === 1 ? "Directly affected" : `Affected at hop ${h}`}
                tone={h === 1 ? "text-hop-1" : h === 2 ? "text-hop-2" : "text-hop-3"}
                items={items}
                onSelect={p.onSelect}
              />
            ))}
            {p.impact.size === 0 && p.deps.length === 0 && (
              <p className="text-sm text-muted-foreground">No connections detected for this item.</p>
            )}
          </div>
        ) : (
          <div>
            {!answer && !busy && (
              <p className="text-sm text-muted-foreground">
                Ask the AI to explain this {p.selection.type}, list what else needs changing, or ask anything below.
              </p>
            )}
            {busy && !answer && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Reading the code…
              </div>
            )}
            <div className="prose-sm space-y-2 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_code]:text-primary [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_strong]:text-foreground [&_ul]:list-disc">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          ask("ask", q.trim());
          setQ("");
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Ask about this ${p.selection.type}…`}
          className="h-9 flex-1 rounded-md border bg-muted/50 px-3 text-sm outline-none focus:border-primary"
        />
        {busy ? (
          <Button type="button" size="icon" variant="secondary" onClick={() => { ctrl.current?.abort(); setBusy(false); }} aria-label="Stop">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </aside>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-md bg-muted/60 py-2">
      <div className={cn("font-mono text-lg font-bold", className)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Group({ title, tone, items, onSelect }: { title: string; tone: string; items: string[]; onSelect: (s: Selection) => void }) {
  return (
    <div className="node-in">
      <div className={cn("mb-1 font-mono text-[11px] uppercase tracking-wider", tone)}>
        {title} · {items.length}
      </div>
      <ul className="space-y-0.5">
        {items.slice(0, 150).map((path) => (
          <li key={path}>
            <button
              onClick={() => onSelect({ type: "file", path })}
              className="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {path}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
