# pi-share-viewer

Self-hosted viewer for Pi session Gists, with responsive navigation, message links, JSONL downloads, interactive Mermaid diagrams, and KaTeX math. Rendering runs locally in the browser; no Pi extension is required.

## Usage

Requires Pi (verified with `0.85.0`), [GitHub CLI](https://cli.github.com/) authenticated with Gist access, and an HTTPS deployment of this viewer.

Set the viewer URL before starting Pi, then run `/share`:

```bash
export PI_SHARE_VIEWER_URL="https://viewer.example.com/session/"
pi
```

Keep the trailing `/`. Shared links use `/session/#<gist-id>`. This setting affects only Pi's GitHub Gist fallback; an available, authenticated Radius provider takes precedence.

> Secret Gists are unlisted, not private. Review sessions for credentials, code, and other sensitive content before sharing. Anyone with the URL can read them.

## Deploy

1. Push this repository to GitHub.
2. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Push to `main` or run the **Deploy GitHub Pages** workflow.
4. Set `PI_SHARE_VIEWER_URL` to `https://<owner>.github.io/<repository>/session/`, or your custom domain's `/session/` path.

The deployment workflow handles the GitHub Pages base path automatically.

## Development

Requires Node.js **22.22.2+**; browser tests also require Google Chrome.

```bash
npm ci
npm run dev        # http://localhost:5173/
npm run ci         # lint, unit tests, typecheck, production build
npm run test:e2e   # Playwright browser tests
```

HTML entries are in `src/index.html` and `src/session/index.html`; static assets are in `public/`. Open `/session/#<gist-id>` to view a session locally. Production output is in `dist/`. E2E tests use a local Pi export and mocked GitHub requests, not real Gists. Chrome/Chromium is verified; Firefox and Safari are not.

## Session controls

- The session keeps Pi's original interaction model: **System Prompt** expands from its preview, **Available Tools** stays visible, and Pi's header, thinking, tool, search, branch, and navigation controls behave as they do on `pi.dev/session`.
- The viewer applies a higher-contrast palette and more readable Markdown typography without replacing Pi's controls or changing which session content is visible.
- Diagrams open fitted to the full **Overview**. Use **Use readable view** for legible label sizes; cropped diagrams remain reachable with arrow keys or fullscreen. Fullscreen supports one-finger pan and two-finger pan/zoom, while inline touch gestures continue to scroll the page. Additional source, copy, style, trace, reset, and export controls are under **More diagram actions**.
- Formula source is available from the **Formula source** control. **Copy LaTeX** copies the original delimited expression. Wide display formulas show local scroll guidance and can be focused for keyboard scrolling.
- The readable base session appears before optional Mermaid and KaTeX assets finish loading. If an optional asset fails, the source remains readable and **Retry enhancements** retries it without replacing the session frame or resetting the current view.

## Security and limits

- Untrusted sessions run in a sandboxed iframe with network requests blocked. The parent fetches Gists through GitHub's unauthenticated API and is subject to its rate limits.
- Mermaid and KaTeX assets are bundled; diagrams, math, and SVG/PNG exports use no rendering service.
- Session loading has no viewer-defined file-size or elapsed-time limit; GitHub's Gist and API behavior remains the upstream boundary. Mermaid output is limited to 50 diagrams, with 100,000 source bytes and a five-second render deadline per diagram. Invalid diagrams or formulas retain their source.
- No backend, OAuth, or Gist management is included. Delete shared content with `gh gist delete <gist-id>`.
