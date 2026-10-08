## Architecture rules

- Repos are fetched as one gzip tarball from codeload and parsed in `src/lib/analyze.server.ts` — avoids per-file subrequest limits on the edge runtime.
- The graph is `{files, edges:[from,to]}` by index; impact/dependency traversal runs client-side in `src/lib/graph-types.ts` — keeps the server stateless and interactions instant.
- AI help streams plain text from the `/api/ai` server route, which fetches file contents from raw.githubusercontent itself — client never sends file bodies.
- Analyzed graphs are cached in localStorage (no accounts) — keeps v1 backend-free.
