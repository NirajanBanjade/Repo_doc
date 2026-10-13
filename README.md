# Repo Impact Map

Understand a public GitHub repository before changing it.

Repo Impact Map downloads a repository, builds an interactive file dependency graph, and shows how a change can ripple through the codebase. Select a file or folder to inspect what it depends on, what depends on it, and ask AI for a plain-English explanation or change-impact assessment.

## Features

- Analyze any public GitHub repository and an optional branch
- Explore files and folders in an interactive dependency graph
- Trace direct and transitive dependents by hop depth
- Inspect imports and likely impact from a focused side panel
- Ask AI to explain code, assess change risk, and suggest what to test
- Cache analyzed graphs locally for fast repeat visits
- Re-analyze a repository on demand
- Parse JavaScript, TypeScript, Python, Vue, and Svelte source imports
- Resolve relative imports and common `tsconfig.json` / `jsconfig.json` aliases

## Getting started

### Prerequisites

- [Bun](https://bun.sh/)
- An [OpenAI API key](https://platform.openai.com/api-keys) for AI features

### Installation

```sh
git clone https://github.com/NirajanBanjade/Repo_doc.git
cd Repo_doc
bun install
```

Create a `.env.local` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key

# Optional
OPENAI_MODEL=gpt-5-mini
GITHUB_TOKEN=your_github_token
```

`GITHUB_TOKEN` is optional, but helps avoid GitHub's lower unauthenticated API rate limit. The app can still map repositories without an OpenAI key; only the AI assistant requires it.

Start the development server:

```sh
bun run dev
```

Open the local URL printed by Vite, paste a GitHub repository URL such as `https://github.com/pmndrs/zustand`, and select **Map it**.

## How it works

1. The server resolves the requested branch and downloads the repository as one gzip tarball from GitHub Codeload.
2. Source files are extracted in memory and imports are resolved into a compact graph of file indexes and `[from, to]` edges.
3. The browser renders the graph and performs dependency and impact traversal locally for instant interaction.
4. When AI help is requested, `/api/ai` fetches only the relevant files from `raw.githubusercontent.com` and streams a plain-text answer. File contents are not sent by the browser.
5. Completed graph analyses are cached in `localStorage`; no account or application database is required.

## Supported analysis

The analyzer detects imports in:

- JavaScript and TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts`)
- Vue and Svelte files
- Python files

Generated assets, dependency folders, build output, media, lockfiles, and other non-source files are skipped. Analysis is currently limited to 2,000 files and 80 MB of decompressed repository data. If a repository exceeds the file limit, source files are prioritized and the result is marked as capped.

## Available commands

| Command | Description |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run build` | Create a production build |
| `bun run preview` | Preview the production build locally |
| `bun run test` | Run the test suite once |
| `bun run test:watch` | Run tests in watch mode |
| `bun run lint` | Check the project with ESLint |
| `bun run format` | Format the project with Prettier |

## Tech stack

- [TanStack Start](https://tanstack.com/start)
- [React](https://react.dev/) and TypeScript
- [XYFlow](https://reactflow.dev/) with Dagre graph layout
- [Tailwind CSS](https://tailwindcss.com/)
- [Vercel AI SDK](https://ai-sdk.dev/) and the OpenAI API
- [Vitest](https://vitest.dev/)

## Privacy and limitations

- Only public GitHub repositories are supported.
- Repository graphs are stored in the current browser's `localStorage` for current version.
- AI requests include selected source code and related snippets fetched by the server, so review your usage requirements before enabling AI features.
- Dependency detection is static and import-based; runtime imports, generated modules, and unusual build-tool aliases may not be captured.

## License

No license has been added yet.
