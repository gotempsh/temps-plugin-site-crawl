# Site Crawl for Temps

Find broken routes and technical SEO issues automatically after successful deployments.

## Install

In Temps, open **Plugins → Install from GitHub** and enter
`https://github.com/gotempsh/temps-plugin-site-crawl`. Use the repository root.
Review the source and grant **Events read** (`events_read`) for deployment automation.
Manual crawls do not require host API grants or an AI provider. A Temps host with
GitHub source installation, Git, and Docker is required. Administrators alone can
access crawl data.

With a compatible Temps CLI:

```sh
bunx --bun @temps-sdk/cli plugin install https://github.com/gotempsh/temps-plugin-site-crawl --ref main --grant events_read
bunx --bun @temps-sdk/cli plugin update site-crawl --ref main
```

Updates are explicit; pushing a commit does not update installed copies. To remove
the plugin, use Temps' plugin uninstall action. Changing an existing installation
from another repository requires uninstall/reinstall and fresh permission grants;
export reports first. This repository is not yet listed in the public catalog.

## Development and behavior


Site Crawl is an administrator-only crawler with a Temps sidebar UI and SQLite-backed reports. It follows same-origin links and up to five sitemap documents, respects robots.txt and nofollow, records redirects and HTTP/network errors, and checks titles, descriptions, canonicals, headings, language, and noindex/sitemap conflicts. Each affected URL includes its referring pages and suggested fixes. Reports can be cancelled, exported as JSON, or deleted; the newest 30 are retained. Interrupted crawls are marked after restart.

```sh
git clone https://github.com/gotempsh/temps-plugin-site-crawl
cd temps-plugin-site-crawl
bun install --frozen-lockfile
bun run check
bun test src
bun run build
```

The native executable is `dist/site-crawl`. `bun run dev` starts a loopback-only development UI at `http://127.0.0.1:3198`; that entrypoint is not distributed as the plugin.

Crawls are limited to 500 URLs, one running job, a 20-minute job deadline, 10 seconds per HTTP request, 8 MiB per response, and at least 250 ms between requests (or a longer robots crawl delay). Only public HTTP/HTTPS origins on standard ports are supported. DNS results are validated and pinned for each connection; private, loopback, reserved addresses and off-origin redirects are not fetched. Manual crawls need no host API grants or AI provider. Automatic crawls require the `events_read` host permission. Native plugins still run with the host OS account's permissions; they are not sandboxed.

Checks analyze returned HTML, not a browser-rendered DOM. JavaScript-only routes, authenticated pages, external links, fragment targets, and orphan pages absent from links/sitemaps are outside this first version. Missing metadata is guidance, not a guarantee of ranking or indexing. Canonical and noindex rules follow [Google Search Central's crawling and indexing guidance](https://developers.google.com/search/docs/crawling-indexing).

### Crawl after deployments

Site Crawl subscribes to `deployment.succeeded`. Grant **Events read** in Temps **Settings → Plugins → Permissions**. The sidebar shows automation settings even when the permission is missing, with a direct setup link. Automatic crawling is enabled by default for successful **production** deployments. Uncheck **Production only** to include preview and other environments. Disable individual projects after their first deployment event arrives, or pause automation globally.

Each event queues the deployment URL after a five-second settling delay. Reports include project, environment, and deployment IDs. Crawls inspect the URL as served at crawl time; a later deployment can replace its contents before a queued crawl begins. Failed deployments are not crawled, and deployments without a supported public URL are reported as skipped.

One crawl runs at a time, including manual crawls. Up to 20 deployments wait in a persistent queue; overflow is skipped with a visible notice. The last 200 deployment identities are retained to suppress duplicate events. Queued work resumes after restart; interrupted active crawls are marked interrupted rather than silently restarted. Changing project/environment settings removes queued jobs that no longer qualify. Administrators can clear the queue and cancel the active crawl separately.

Live permission discovery is checked before each queued crawl. Revoking Events read pauses queued work and stops new host event delivery; an already-started crawl continues until completion or cancellation. Permissions are retried every 30 seconds. Older hosts without capability discovery can still run manual crawls but cannot activate this automation.

### Design system

The plugin UI uses React and an attributed snapshot of the Temps design-system components from the `design-system-ds` worktree: PageContainer, PageHeader, Button, Field, Callout, Status, PageState, and their Radix-based UI primitives. See `web/vendor/README.md` for provenance and update instructions. The Vite build embeds the UI into the native executable; no local-worktree dependency or external frontend service is required. Light/dark themes, keyboard-accessible dialogs and tabs, and responsive tables are supported.

The 8 MiB response bound accommodates larger documentation HTML. Responses above this limit retain their observed HTTP status and report an incomplete-inspection warning rather than claiming a broken route. Existing saved reports retain their original results; rerun a crawl to apply the new behavior.

### Tokenizer-based parsing

HTML analysis and sitemap discovery use `htmlparser2` callbacks instead of constructing a Cheerio DOM. Only bounded SEO fields and crawl targets are retained: titles up to 1,000 characters, descriptions up to 2,000, and at most 2,000 links per page. Script/template/noscript/SVG content cannot introduce phantom page metadata or crawl links. XML sitemap parsing preserves namespaced URL discovery and document/URL caps.

HTTP downloads still buffer at most 8 MiB before tokenization; this is not network-streaming analysis and does not execute JavaScript. HTML nesting over 128 levels and XML nesting over 64 levels stop inspection with a contextual warning/notice. Existing DNS, redirects, robots, scheduling and permission checks continue to apply.

## Source installation build

The committed `web/dist` bundle is imported by the executable so the host can
compile without running package lifecycle scripts. After UI changes run
`bun run build:ui` and commit the refreshed bundle. CI checks it is reproducible.

```sh
bun install --frozen-lockfile --ignore-scripts
bun build src/index.ts --compile --outfile dist/site-crawl
```

The code was extracted from `gotempsh/plugins`, commit
`83ccfeabd110246627b314bc3dbead8fa9ec1187`, directory `site-crawl-plugin`.
Local build/test evidence does not establish a full installed-host workflow for
this new repository URL.

## License and support

Dual licensed under [Apache 2.0](LICENSE) or [MIT](LICENSE-MIT).
Report bugs and request features in this repository's GitHub Issues.
