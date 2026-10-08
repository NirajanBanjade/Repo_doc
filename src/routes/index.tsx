import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, GitBranch, Network, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseRepoUrl, readRecent, type Recent } from "@/lib/repo-cache";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Repo Impact Map — see what breaks before you change it" },
      {
        name: "description",
        content: "Paste a GitHub repo and get an interactive dependency map with AI-assisted change impact analysis.",
      },
      { property: "og:title", content: "Repo Impact Map" },
      {
        property: "og:description",
        content: "Interactive dependency maps and AI change-impact analysis for any public GitHub repo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const EXAMPLES = ["pmndrs/zustand", "tiangolo/typer", "shadcn-ui/taxonomy"];

function Home() {
  const nav = useNavigate();
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => setRecent(readRecent()), []);

  const go = (value: string, b?: string) => {
    const p = parseRepoUrl(value);
    if (!p) return setErr("That doesn't look like a GitHub repo. Try github.com/owner/repo.");
    const br = b || p.branch || undefined;
    nav({ to: "/repo/$owner/$name", params: { owner: p.owner, name: p.repo }, search: br ? { branch: br } : {} });
  };

  return (
    <main className="blueprint-grid min-h-screen">
      <div className="mx-auto flex max-w-3xl flex-col px-6 pt-24 pb-16">
        <div className="node-in flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-primary">
          <Radar className="h-4 w-4" /> Repo Impact Map
        </div>
        <h1 className="node-in mt-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl" style={{ animationDelay: "60ms" }}>
          Change one file.
          <br />
          <span className="text-primary">See every ripple.</span>
        </h1>
        <p className="node-in mt-5 max-w-xl text-lg text-muted-foreground" style={{ animationDelay: "120ms" }}>
          Paste a GitHub repo. Get a living map of how files and folders connect, click anything to trace what it
          affects, and let AI tell you what else needs to change.
        </p>

        <form
          className="node-in mt-10 rounded-xl border bg-card/80 p-3 shadow-2xl backdrop-blur"
          style={{ animationDelay: "180ms" }}
          onSubmit={(e) => {
            e.preventDefault();
            go(url, branch);
          }}
        >
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setErr("");
              }}
              placeholder="https://github.com/owner/repo"
              className="h-12 flex-1 border-0 bg-transparent font-mono text-base focus-visible:ring-0"
            />
            <div className="flex items-center gap-2 rounded-md bg-muted px-3">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="default branch"
                className="h-12 w-36 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 gap-2 px-6 font-semibold">
              Map it <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          {err && <p className="px-3 pt-2 text-sm text-destructive">{err}</p>}
        </form>

        <div className="node-in mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" style={{ animationDelay: "240ms" }}>
          Try:
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => go(e)}
              className="rounded-full border px-3 py-1 font-mono text-xs transition-colors hover:border-primary hover:text-primary"
            >
              {e}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <section className="mt-14">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Recently mapped</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recent.map((r) => (
                <Link
                  key={r.owner + r.repo}
                  to="/repo/$owner/$name"
                  params={{ owner: r.owner, name: r.repo }}
                  search={r.branch ? { branch: r.branch } : {}}
                  className="group flex items-center justify-between rounded-lg border bg-card/60 px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-primary"
                >
                  <span className="flex items-center gap-2 font-mono text-sm">
                    <Network className="h-4 w-4 text-primary" />
                    {r.owner}/{r.repo}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.files} files</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            ["Map", "Folders and files laid out by how they import each other."],
            ["Trace", "Click any node to light up everything it ripples into, hop by hop."],
            ["Ask", "AI explains each piece and lists what else you'll need to change."],
          ].map(([t, d], i) => (
            <div key={t} className="node-in rounded-lg border bg-card/50 p-4" style={{ animationDelay: `${300 + i * 60}ms` }}>
              <div className="font-mono text-xs text-primary">0{i + 1}</div>
              <div className="mt-1 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
