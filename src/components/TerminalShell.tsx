import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Award,
  Bell,
  Bot,
  ClipboardList,
  Command,
  Compass,
  Database,
  Gauge,
  GitCompare,
  HelpCircle,
  History,
  Keyboard,
  LayoutDashboard,
  Lightbulb,
  LineChart,
  Network,
  Plug,
  Radar,
  Brain,
  FlaskConical,
  ScrollText,
  Target,
  Users,
  ServerCog,
  Star,
  TrendingUp,
  Workflow,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useLiveWiring } from "@/hooks/useLive";
import { LiveBar } from "@/components/stellaris/LiveBar";
import { CosmicBackground } from "@/components/cosmos/CosmicBackground";
import { DataStreamLayer } from "@/components/cosmos/DataStreamLayer";
import { Tag } from "@/components/kit";
import { clockOf } from "@/lib/format";
import { marketQuery } from "@/hooks/useMarket";
import { acknowledgeAlerts, getAlerts, subscribeStore } from "@/lib/local-store";
import { getPrefs, subscribePrefs } from "@/lib/workspaces";
import { CommandPalette } from "@/components/CommandPalette";

/** PRIMARY SURFACES — the only six entries in primary navigation. */
const NAV = [
  { to: "/command", label: "COMMAND", icon: Command, keys: "G D" },
  { to: "/scan", label: "RAPID SCAN", icon: Radar, keys: "G L" },
  { to: "/watchlist", label: "WATCHLIST", icon: Star, keys: "G W" },
  { to: "/investigations", label: "INVESTIGATIONS", icon: FlaskConical, keys: "G Z" },
  { to: "/memory", label: "MEMORY", icon: Database, keys: "G E" },
  { to: "/system", label: "SYSTEM", icon: ServerCog, keys: "G S" },
] as const;

/**
 * ADVANCED SURFACES — every previously built page is preserved and reachable
 * here and from the contextual panels inside the six primary surfaces. None of
 * this functionality was removed; it simply no longer occupies primary
 * navigation.
 */
const ADVANCED = [
  { to: "/discover", label: "DISCOVER", icon: Compass, keys: "/" },
  { to: "/markets", label: "MARKETS", icon: LineChart, keys: "G M" },
  { to: "/attention", label: "ATTENTION", icon: Brain, keys: "G T" },
  { to: "/research", label: "RESEARCH QUEUE", icon: ClipboardList, keys: "G J" },
  { to: "/room", label: "AGENT ROOM", icon: Users, keys: "G O" },
  { to: "/questions", label: "QUESTIONS", icon: HelpCircle, keys: "G Q" },
  { to: "/hypotheses", label: "HYPOTHESES", icon: Lightbulb, keys: "G H" },
  { to: "/contradictions", label: "CONTRADICTIONS", icon: GitCompare, keys: "G C" },
  { to: "/timemachine", label: "TIME MACHINE", icon: History, keys: "G X" },
  { to: "/postmortems", label: "POST-MORTEMS", icon: ScrollText, keys: "G P" },
  { to: "/calibration", label: "CALIBRATION", icon: Target, keys: "G B" },
  { to: "/performance", label: "PERFORMANCE", icon: Award, keys: "G F" },
  { to: "/neural", label: "STELLARIS BRAIN", icon: Network, keys: "G N" },
  { to: "/stream", label: "STREAM", icon: Activity, keys: "G I" },
  { to: "/risk", label: "RISK", icon: Gauge, keys: "G R" },
  { to: "/anomalies", label: "ANOMALIES", icon: Radar, keys: "" },
  { to: "/agents", label: "AGENTS", icon: Bot, keys: "" },
  { to: "/alerts", label: "NOTIFICATIONS", icon: Bell, keys: "G A" },
  { to: "/trends", label: "TRENDS", icon: TrendingUp, keys: "" },
  { to: "/workspaces", label: "WORKSPACES", icon: LayoutDashboard, keys: "G K" },
  { to: "/integrations", label: "INTEGRATIONS", icon: Plug, keys: "G G" },
  { to: "/workflows", label: "WORKFLOWS", icon: Workflow, keys: "G Y" },
  { to: "/incidents", label: "INCIDENTS", icon: AlertTriangle, keys: "G V" },
  { to: "/audit", label: "AUDIT LOG", icon: ScrollText, keys: "G U" },
] as const;

export function TerminalShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // One shared Realtime connection per tab; database writes refresh the
  // affected queries the moment they happen.
  useLiveWiring();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const market = useQuery(marketQuery);
  const [help, setHelp] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    const sync = () => setAlertCount(getAlerts().filter((a) => !a.acknowledged).length);
    sync();
    return subscribeStore(sync);
  }, []);

  // USER CUSTOMIZATION — density, motion and accent are applied to the document root.
  useEffect(() => {
    const apply = () => {
      const p = getPrefs();
      const root = document.documentElement;
      root.dataset["density"] = p.density.toLowerCase();
      root.dataset["motion"] = p.animation.toLowerCase();
      root.dataset["accent"] = p.accent.toLowerCase();
    };
    apply();
    return subscribePrefs(apply);
  }, []);

  const pairs = market.data?.data ?? [];
  const chains = useMemo(() => new Set(pairs.map((p) => p.chainId)).size, [pairs]);
  const dexs = useMemo(() => new Set(pairs.map((p) => p.dexId)).size, [pairs]);

  const status = market.isError || (market.data && !market.data.ok)
    ? { label: "DATA SOURCE UNAVAILABLE", tone: "text-signal-extreme" }
    : market.isFetching
      ? { label: "SYNCHRONIZING", tone: "text-cyan" }
      : market.data?.stale
        ? { label: "STALE DATA", tone: "text-signal-mid" }
        : market.data
          ? { label: "SYSTEM ONLINE", tone: "text-signal-low" }
          : { label: "INITIALIZING", tone: "text-muted-foreground" };

  // KEYBOARD SHORTCUTS
  useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (e.key === "Escape") {
        setHelp(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      if (typing) return;
      if (e.key === "?") {
        setHelp((v) => !v);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        void navigate({ to: "/discover", search: { q: "", focus: true } });
        return;
      }
      if (e.key.toLowerCase() === "g") {
        pendingG = true;
        clearTimeout(timer);
        timer = setTimeout(() => (pendingG = false), 900);
        return;
      }
      if (!pendingG) return;
      pendingG = false;
      const map: Record<string, string> = {
        d: "/command",
        w: "/watchlist",
        a: "/alerts",
        r: "/risk",
        m: "/markets",
        s: "/system",
        l: "/scan",
        z: "/investigations",
        t: "/attention",
        j: "/research",
        o: "/room",
        q: "/questions",
        h: "/hypotheses",
        c: "/contradictions",
        e: "/memory",
        x: "/timemachine",
        p: "/postmortems",
        b: "/calibration",
        f: "/performance",
        n: "/neural",
        i: "/stream",
        k: "/workspaces",
        g: "/integrations",
        y: "/workflows",
        v: "/incidents",
        u: "/audit",
      };
      const to = map[e.key.toLowerCase()];
      if (to) void navigate({ to });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <CosmicBackground />
      <DataStreamLayer pairs={pairs} />
      <CommandPalette />

      {/* TOP BAR */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 sm:px-5">
          <Link to="/command" className="flex items-center gap-2">
            <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-cyan/50">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            </span>
            <span className="display text-sm tracking-[0.18em] text-foreground">STELLARIS INTEL</span>
          </Link>

          <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1">
            <TopStat label="SYSTEM STATUS" value={status.label} tone={status.tone} />
            <TopStat label="LIVE DATA" value={market.data?.ok ? "CONNECTED" : "UNAVAILABLE"} tone={market.data?.ok ? "text-signal-low" : "text-signal-extreme"} />
            <TopStat label="LAST UPDATE" value={clockOf(market.data?.observedAt ?? null)} />
            <TopStat label="ACTIVE CHAINS" value={pairs.length ? String(chains) : "—"} />
            <TopStat label="ACTIVE DEXS" value={pairs.length ? String(dexs) : "—"} />
            <Link to="/alerts" className="group">
              <TopStat label="ALERTS" value={String(alertCount)} tone={alertCount ? "text-signal-high" : "text-muted-foreground"} />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelp(true)}
              className="num flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground transition-colors hover:border-cyan/50 hover:text-cyan"
            >
              <Keyboard className="h-3 w-3" /> ?
            </button>
            <span className="num flex items-center gap-2 rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" /> LOCAL ANALYST
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1800px] gap-4 px-3 py-4 sm:px-5">
        {/* LEFT NAV */}
        <nav className="hidden w-52 shrink-0 lg:block">
          <div className="panel sticky top-16 p-2">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "num flex items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-[11px] tracking-[0.12em] transition-colors",
                    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <n.icon className={cn("h-3.5 w-3.5", active && "text-cyan")} />
                    {n.label}
                  </span>
                  {n.keys && <span className="text-[9px] text-unknown">{n.keys}</span>}
                </Link>
              );
            })}
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={() => setAdvanced((v) => !v)}
                className="num flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-[10px] tracking-[0.14em] text-unknown hover:text-cyan"
              >
                ADVANCED SURFACES
                {advanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {advanced &&
                ADVANCED.map((n) => {
                  const active = pathname.startsWith(n.to);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      className={cn(
                        "num flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-[10px] tracking-[0.1em] transition-colors",
                        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <n.icon className={cn("h-3 w-3", active && "text-cyan")} />
                        {n.label}
                      </span>
                      {n.keys && <span className="text-[9px] text-unknown">{n.keys}</span>}
                    </Link>
                  );
                })}
            </div>
            <div className="mt-2 border-t border-border px-2.5 pt-2">
              <Tag kind="VISUAL" label="ENVIRONMENT ACTIVE" />
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1 pb-24 lg:pb-6">
          <LiveBar />
          {children}
        </main>
      </div>

      {/* MOBILE NAV */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="flex overflow-x-auto">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex min-w-[4.5rem] flex-col items-center gap-1 px-2 py-2 text-[9px] tracking-[0.1em]",
                  active ? "text-cyan" : "text-muted-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                <span className="num">{n.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* HELP OVERLAY */}
      {help && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-md" onClick={() => setHelp(false)}>
          <div className="panel w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-sm tracking-[0.18em]">KEYBOARD SHORTCUTS</h2>
              <button onClick={() => setHelp(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {[
                ["CTRL/⌘ K", "Command palette and universal search"],
                ["/", "Open discovery search"],
                ["G D", "Command"],
                ["G L", "Rapid Scan"],
                ["G Z", "Investigations"],
                ["G T", "Attention"],
                ["G J", "Research"],
                ["G O", "Agent room"],
                ["G Q", "Open questions"],
                ["G H", "Hypotheses"],
                ["G C", "Contradictions"],
                ["G E", "Memory"],
                ["G X", "Time machine"],
                ["G P", "Post-mortems"],
                ["G B", "Calibration"],
                ["G F", "Agent performance"],
                ["G N", "Neural link"],
                ["G I", "Intelligence stream"],
                ["G K", "Workspaces"],
                ["G G", "Integrations"],
                ["G Y", "Workflow studio"],
                ["G V", "Incidents"],
                ["G U", "Audit log"],
                ["G M / W / A / R / S", "Markets · watchlist · alerts · risk · system"],
                ["?", "Toggle this overlay"],
                ["ESC", "Close panel / blur input"],
              ].map(([k, d]) => (
                <li key={k} className="flex items-center justify-between gap-4 border-b border-border/60 pb-2">
                  <span className="num rounded-sm border border-border px-2 py-0.5 text-[10px] tracking-[0.14em] text-cyan">{k}</span>
                  <span className="text-xs text-muted-foreground">{d}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                acknowledgeAlerts();
                setHelp(false);
              }}
              className="num mt-4 w-full rounded-sm border border-border px-3 py-2 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
            >
              ACKNOWLEDGE ALL ALERTS
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 h-px bg-cyan/25 anim-sweep" aria-hidden />
    </div>
  );
}

function TopStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="label-xs">{label}</span>
      <span className={cn("num text-[11px] tracking-[0.1em]", tone ?? "text-foreground")}>{value}</span>
    </div>
  );
}

export function AnalystActivityHint() {
  return (
    <div className="flex items-center gap-2">
      <Activity className="h-3 w-3 text-cyan" />
      <span className="label-xs">observations recorded locally in this browser</span>
    </div>
  );
}
