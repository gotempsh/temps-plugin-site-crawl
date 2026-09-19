// SPDX-FileCopyrightText: 2024-2026 Temps Contributors
// SPDX-License-Identifier: MIT OR Apache-2.0
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ScanSearch,
  RefreshCw,
  Download,
  ArrowLeft,
  ArrowUpRight,
  ListChecks,
  Plus,
  Trash2,
  CircleStop,
  Settings2,
} from "lucide-react";
import { ResponsivePagination } from "./vendor/ds/responsive-pagination";
import { paginate } from "../src/pagination";
import { Button } from "./vendor/ds/button";
import { Field } from "./vendor/ds/field";
import { Callout } from "./vendor/ds/callout";
import { Status, type StatusTone } from "./vendor/ds/status";
import { PageState } from "./vendor/ds/page-state";
import {
  Input,
  Checkbox,
  Label,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Tabs,
  TabsContent,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./vendor/ui";
import type { Report, AutomationSettings, HostEventAccess } from "../src/types";
import "./style.css";
const base = location.pathname.includes("/ui")
  ? location.pathname.split("/ui")[0]
  : "";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Request failed. Retry the operation.");
  return result;
}
type Summary = Omit<Report, "pages"> & {
  checked: number;
  errors: number;
  issues: number;
};
type Automation = {
  settings: AutomationSettings;
  access: HostEventAccess;
  queued: number;
  projects: { id: number; url: string }[];
  notice: string | null;
};
const tone = (state: Report["state"]): StatusTone =>
  state === "running"
    ? "running"
    : state === "completed"
      ? "ok"
      : state === "failed"
        ? "error"
        : "idle";
function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
function App() {
  const cache = useQueryClient();
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, "") || "reports");
  useEffect(() => {
    const changed = () => setRoute(location.hash.replace(/^#\/?/, "") || "reports");
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const navigate = (path: string) => { location.hash = `/${path}`; };
  const selected = route.startsWith("reports/") ? route.slice(8) : null;
  const tab = route === "automation" ? "automation" : route === "new" ? "new" : "reports";
  const setSelected = (id: string | null) => navigate(id ? `reports/${id}` : "reports");
  const [historyPage, setHistoryPage] = useState(1);
  const [resultPage, setResultPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [url, setUrl] = useState("");
  const [limit, setLimit] = useState(100);
  const [draft, setDraft] = useState<AutomationSettings | null>(null);
  const [confirmation, setConfirmation] = useState<"delete" | "queue" | null>(
    null,
  );
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    let host: HTMLElement | undefined;
    try { if (window.parent !== window) host = window.parent.document.documentElement; } catch { /* standalone fallback */ }
    const sync = () => {
      const dark = host ? host.classList.contains("dark") : system.matches;
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    const observer = new MutationObserver(sync);
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["class"] });
    system.addEventListener("change", sync);
    sync();
    return () => { observer.disconnect(); system.removeEventListener("change", sync); };
  }, []);
  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () => api<Summary[]>("/reports"),
    refetchInterval: 1500,
  });
  const automation = useQuery({
    queryKey: ["automation"],
    queryFn: () => api<Automation>("/automation"),
    refetchInterval: 15000,
  });
  const id = selected;
  const report = useQuery({
    queryKey: ["report", id],
    queryFn: () => api<Report>(`/reports/${encodeURIComponent(id!)}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1500 : false),
  });
  const refresh = () => cache.invalidateQueries();
  const start = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/reports", "POST", { url, maxPages: limit }),
    onSuccess: (r) => {
      setSelected(r.id);
      setResultPage(1);
      void refresh();
    },
  });
  const save = useMutation({
    mutationFn: () => api<AutomationSettings>("/automation", "PUT", draft),
    onSuccess: () => {
      setDraft(null);
      void refresh();
    },
  });
  const action = useMutation({
    mutationFn: ({ path, method }: { path: string; method: string }) =>
      api(path, method),
    onSuccess: (_, args) => {
      if (args.method === "DELETE" && args.path.startsWith("/reports/"))
        setSelected(null);
      setConfirmation(null);
      void refresh();
    },
  });
  const settings = draft ?? automation.data?.settings;
  const errors = [
    reports.error,
    automation.error,
    report.error,
    start.error,
    save.error,
    action.error,
  ].filter(Boolean);
  const running =
    reports.data?.some((r) => r.state === "running") ||
    (automation.data?.queued ?? 0) > 0;
  const r = report.data;
  const pages =
    r?.pages.filter(
      (p) => filter === "all" || p.issues.some((i) => i.severity === filter),
    ) ?? [];
  const history = paginate(reports.data ?? [], historyPage, 8);
  const results = paginate(pages, resultPage, 8);
  return (
    <div className="plugin-shell">
      <nav className="plugin-sidebar" aria-label="Site Crawl navigation">
        <Button variant={tab === "reports" ? "secondary" : "ghost"} className="justify-start" onClick={() => navigate("reports")}><ListChecks /> Crawl reports</Button>
        <Button variant={tab === "new" ? "secondary" : "ghost"} className="justify-start" onClick={() => navigate("new")}><Plus /> New crawl</Button>
        <Button variant={tab === "automation" ? "secondary" : "ghost"} className="justify-start" onClick={() => navigate("automation")}><Settings2 /> Automation</Button>
      </nav>
      <main className="plugin-content">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {selected && <Button variant="ghost" size="icon" aria-label="Back to crawl reports" onClick={() => navigate("reports")}><ArrowLeft /></Button>}
            <h1 className="text-lg font-semibold">{selected ? "Crawl details" : tab === "new" ? "New crawl" : tab === "automation" ? "Deployment automation" : "Crawl reports"}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw /> Refresh</Button>
        </header>
        <div className="plugin-workspace">
      {errors.length > 0 && (
        <Callout tone="error" title="Could not complete the request">
          {errors.map((e, i) => (
            <p key={i}>{e?.message}</p>
          ))}
          <Button variant="link" onClick={() => void refresh()}>
            Retry loading
          </Button>
        </Callout>
      )}
      {tab === "new" && <Section title="Crawl a website">
        <form
          className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!start.isPending && !running) start.mutate();
          }}
        >
          <Field label="Site URL">
            {(props) => (
              <Input
                {...props}
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-site.com"
              />
            )}
          </Field>
          <Field label="URL limit">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                max={500}
                required
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            )}
          </Field>
          <Button
            type="submit"
            busy={start.isPending}
            busyLabel="Starting…"
            disabled={running}
          >
            <ScanSearch />
            Start crawl
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Public URLs · Same-origin links · Respects robots.txt · Server HTML,
          without JavaScript rendering
        </p>
        {running && (
          <p className="mt-2 text-sm text-muted-foreground">
            A crawl is running or queued. Wait for it to finish, or cancel it
            before starting another.
          </p>
        )}
      </Section>}
      <Tabs value={tab}>
        <TabsContent value="reports" className="space-y-6">
          <>{!selected && <Section title="Crawl history" actions={<Button size="sm" onClick={() => navigate("new")}><Plus /> New crawl</Button>}>
            {reports.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading reports…
              </p>
            ) : !reports.data?.length ? (
              <PageState
                variant="empty"
                size="compact"
                icon={ScanSearch}
                title="No crawl reports yet"
                description="Start a crawl above or enable deployment automation to find broken links before your visitors do."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>URLs</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.map((item) => (
                    <TableRow
                      key={item.id}
                      data-state={id === item.id ? "selected" : undefined}
                    >
                      <TableCell>
                        <button
                          className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-ring"
                          onClick={() => { setResultPage(1); setSelected(item.id); }}
                        >
                          {new URL(item.url).hostname} <ArrowUpRight className="ml-1 inline size-3.5" />
                        </button>
                        {item.trigger && (
                          <p className="text-xs text-muted-foreground">
                            Deployment #{item.trigger.deploymentId} ·{" "}
                            {item.trigger.environmentName}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Status tone={tone(item.state)} label={item.state} />
                      </TableCell>
                      <TableCell>{item.checked}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(item.startedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!!reports.data?.length && <ResponsivePagination className="mt-4 border-t pt-3" ariaLabel="Crawl history pagination" page={history.page} pageSize={8} total={reports.data.length} totalPages={history.totalPages} onPageChange={setHistoryPage} />}
          </Section>}</>
          {selected && report.isPending && <p role="status">Loading crawl details…</p>}
          {selected && r && (
            <Section
              title={new URL(r.url).hostname}
              actions={
                <>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${base}/api/reports/${r.id}/export`} download>
                      <Download />
                      Export JSON
                    </a>
                  </Button>
                  {r.state === "running" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      busy={action.isPending}
                      onClick={() =>
                        action.mutate({
                          path: `/reports/${r.id}/cancel`,
                          method: "POST",
                        })
                      }
                    >
                      <CircleStop /> Cancel crawl
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmation("delete")}
                    >
                      <Trash2 /> Delete report
                    </Button>
                  )}
                </>
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Status tone={tone(r.state)} label={r.state} />
                  <span className="break-all text-sm text-muted-foreground">
                    {r.url}
                  </span>
                </div>
                <dl className="grid grid-cols-3 divide-x rounded-md border">
                  {[
                    [r.pages.length, "URLs checked"],
                    [
                      r.pages.filter((p) =>
                        p.issues.some((i) => i.severity === "error"),
                      ).length,
                      "Routes with errors",
                    ],
                    [
                      r.pages.reduce(
                        (n, p) =>
                          n +
                          p.issues.filter((i) => i.severity === "warning")
                            .length,
                        0,
                      ),
                      "SEO warnings",
                    ],
                  ].map(([value, label]) => (
                    <div key={label} className="p-3 sm:p-4">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 text-2xl font-semibold tabular-nums">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {r.trigger && (
                  <p className="text-sm text-muted-foreground">
                    Deployment #{r.trigger.deploymentId} ·{" "}
                    {r.trigger.environmentName} · automatic crawl
                  </p>
                )}
                {r.error && <Callout tone="error">{r.error}</Callout>}
                {r.notices.map((notice, i) => (
                  <Callout key={i}>{notice}</Callout>
                ))}
                {r.state === "running" && (
                  <Callout>
                    Crawling… {r.discovered} URLs discovered. You can leave this
                    page; the crawl continues.
                  </Callout>
                )}
                <div className="flex flex-wrap gap-2">
                  {[
                    ["all", "All URLs"],
                    ["error", "Broken routes"],
                    ["warning", "SEO warnings"],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={filter === value ? "secondary" : "ghost"}
                      aria-pressed={filter === value}
                      onClick={() => { setFilter(value!); setResultPage(1); }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {!pages.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {r.state === "running"
                      ? "Waiting for matching results…"
                      : "No matching URLs in this report."}
                  </p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {results.items.map((page) => (
                      <details key={page.url} className="group">
                        <summary className="flex cursor-pointer items-start gap-3 p-3 text-sm focus-visible:outline-ring">
                          <Status
                            tone={
                              page.issues.some((i) => i.severity === "error")
                                ? "error"
                                : page.issues.some(
                                      (i) => i.severity === "warning",
                                    )
                                  ? "warn"
                                  : "idle"
                            }
                            label={
                              page.status === null
                                ? "Not checked"
                                : String(page.status)
                            }
                          />
                          <span className="min-w-0 flex-1 break-all font-mono text-xs leading-6">
                            {page.url}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {page.issues.length} issues
                          </span>
                        </summary>
                        <div className="max-h-72 space-y-3 overflow-y-auto border-t bg-muted/20 p-4 text-sm">
                          {page.title && (
                            <p className="font-medium">{page.title}</p>
                          )}
                          {page.finalUrl !== page.url && (
                            <p className="break-all text-muted-foreground">
                              Final URL: {page.finalUrl}
                            </p>
                          )}
                          {page.issues.map((issue, i) => (
                            <Callout
                              key={i}
                              tone={
                                issue.severity === "error"
                                  ? "error"
                                  : issue.severity === "warning"
                                    ? "warning"
                                    : "info"
                              }
                              title={issue.message}
                            >
                              {issue.fix}
                            </Callout>
                          ))}
                          {!page.issues.length && (
                            <p>No issues found by these checks.</p>
                          )}
                          <h3 className="font-medium">Discovered from</h3>
                          {page.sources.map((source) => (
                            <p
                              key={source}
                              className="break-all text-muted-foreground"
                            >
                              {source}
                            </p>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
                {!!pages.length && <ResponsivePagination ariaLabel="Crawl URLs pagination" page={results.page} pageSize={8} total={pages.length} totalPages={results.totalPages} onPageChange={setResultPage} />}
              </div>
            </Section>
          )}
        </TabsContent>
        <TabsContent value="automation">
          <Section
            title="Crawl after deployments"
            actions={
              <Status
                tone={
                  automation.data?.access.configured && settings?.enabled
                    ? "ok"
                    : "idle"
                }
                label={`${automation.data?.queued ?? 0} queued`}
              />
            }
          >
            {!settings ? (
              <p role="status">Loading automation settings…</p>
            ) : (
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft && !save.isPending) save.mutate();
                }}
              >
                {!automation.data?.access.configured && (
                  <Callout title="Connect deployment events">
                    {automation.data?.access.reason}
                    <p className="mt-1">
                      After setup, each successful deployment creates a report
                      of broken routes and SEO issues.
                    </p>
                    <Button variant="link" asChild>
                      <a href="/settings/plugins" target="_top">
                        Open plugin permissions
                      </a>
                    </Button>
                  </Callout>
                )}
                {automation.data?.notice && (
                  <Callout>{automation.data.notice}</Callout>
                )}
                <div className="space-y-4">
                  {[
                    ["enabled", "Automatically crawl successful deployments"],
                    ["productionOnly", "Production only"],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3">
                      <Checkbox
                        id={key}
                        checked={settings[key as "enabled" | "productionOnly"]}
                        onCheckedChange={(value) =>
                          setDraft({ ...settings, [key!]: value === true })
                        }
                      />
                      <Label htmlFor={key}>{label}</Label>
                    </div>
                  ))}
                </div>
                <Field
                  label="URL limit per deployment"
                  description="Between 1 and 500 URLs. One crawl runs at a time."
                  className="max-w-sm"
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={settings.maxPages}
                      onChange={(e) =>
                        setDraft({
                          ...settings,
                          maxPages: Number(e.target.value),
                        })
                      }
                    />
                  )}
                </Field>
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Projects</h3>
                  {!automation.data?.projects.length ? (
                    <p className="text-sm text-muted-foreground">
                      Project controls appear as deployment events arrive. All
                      projects are included by default.
                    </p>
                  ) : (
                    automation.data.projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`project-${project.id}`}
                          checked={
                            !settings.excludedProjects.includes(project.id)
                          }
                          onCheckedChange={(value) =>
                            setDraft({
                              ...settings,
                              excludedProjects:
                                value === true
                                  ? settings.excludedProjects.filter(
                                      (id) => id !== project.id,
                                    )
                                  : [...settings.excludedProjects, project.id],
                            })
                          }
                        />
                        <Label
                          className="break-all"
                          htmlFor={`project-${project.id}`}
                        >
                          {new URL(project.url).hostname} · Project #
                          {project.id}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Crawls wait five seconds after deployment. Reports identify
                  the deployment that triggered them. Disabling automation
                  removes queued work; cancel an active crawl separately.
                </p>
                <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                  <Button
                    type="submit"
                    busy={save.isPending}
                    busyLabel="Saving…"
                    disabled={!draft}
                  >
                    Save automation
                  </Button>
                  {save.isSuccess && !draft && (
                    <span
                      role="status"
                      className="text-sm text-muted-foreground"
                    >
                      Settings saved.
                    </span>
                  )}
                  {!!automation.data?.queued && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmation("queue")}
                    >
                      Clear queue
                    </Button>
                  )}
                </div>
              </form>
            )}
          </Section>
        </TabsContent>
      </Tabs>
      </div>
      </main>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !action.isPending) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "delete"
                ? "Delete this crawl report?"
                : "Clear the deployment queue?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === "delete"
                ? `This permanently removes the saved report for ${r?.url}.`
                : "Queued deployments will not be crawled. An active crawl will continue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {action.error && (
            <p role="alert" className="text-sm text-destructive">
              {action.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>
              Keep {confirmation === "delete" ? "report" : "queue"}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              busy={action.isPending}
              onClick={() =>
                action.mutate({
                  path:
                    confirmation === "delete"
                      ? `/reports/${r?.id}`
                      : "/automation/queue",
                  method: "DELETE",
                })
              }
            >
              {confirmation === "delete" ? "Delete report" : "Clear queue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: 1 } } })}
  >
    <App />
  </QueryClientProvider>,
);
