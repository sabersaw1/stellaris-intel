import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Assessment } from "@/lib/dex-types";
import { deletePreset, getPresets, savePreset, subscribeStore, type FilterPreset } from "@/lib/local-store";

export type Field =
  | "chain"
  | "dex"
  | "liquidity"
  | "volume24h"
  | "fdv"
  | "marketCap"
  | "txns24h"
  | "buys24h"
  | "sells24h"
  | "pairAgeHours"
  | "priceChange24h"
  | "volatility"
  | "vlRatio"
  | "risk"
  | "confidence"
  | "anomalies"
  | "freshnessSeconds"
  | "boosts"
  | "hasProfile";

export type Op = "gt" | "lt" | "eq" | "contains";

export type Condition = { id: string; field: Field; op: Op; value: string; negate: boolean };
export type Group = { id: string; combinator: "AND" | "OR"; conditions: Condition[]; groups: Group[] };

const FIELDS: { value: Field; label: string; kind: "number" | "text" | "bool" }[] = [
  { value: "chain", label: "Chain", kind: "text" },
  { value: "dex", label: "DEX", kind: "text" },
  { value: "liquidity", label: "Liquidity USD", kind: "number" },
  { value: "volume24h", label: "Volume 24h", kind: "number" },
  { value: "fdv", label: "FDV", kind: "number" },
  { value: "marketCap", label: "Market cap", kind: "number" },
  { value: "txns24h", label: "Transactions 24h", kind: "number" },
  { value: "buys24h", label: "Buys 24h", kind: "number" },
  { value: "sells24h", label: "Sells 24h", kind: "number" },
  { value: "pairAgeHours", label: "Pair age (hours)", kind: "number" },
  { value: "priceChange24h", label: "Price change 24h %", kind: "number" },
  { value: "volatility", label: "Volatility proxy %", kind: "number" },
  { value: "vlRatio", label: "Volume / liquidity", kind: "number" },
  { value: "risk", label: "Risk score", kind: "number" },
  { value: "confidence", label: "Confidence score", kind: "number" },
  { value: "anomalies", label: "Anomaly count", kind: "number" },
  { value: "freshnessSeconds", label: "Data age (seconds)", kind: "number" },
  { value: "boosts", label: "Active boosts", kind: "number" },
  { value: "hasProfile", label: "Has token profile", kind: "bool" },
];

const uid = () => Math.random().toString(36).slice(2, 8);

export const emptyGroup = (): Group => ({ id: uid(), combinator: "AND", conditions: [], groups: [] });

function fieldValue(a: Assessment, f: Field): number | string | boolean | null {
  switch (f) {
    case "chain":
      return a.pair.chainId;
    case "dex":
      return a.pair.dexId;
    case "liquidity":
      return a.pair.liquidityUsd;
    case "volume24h":
      return a.pair.volume.h24;
    case "fdv":
      return a.pair.fdv;
    case "marketCap":
      return a.pair.marketCap;
    case "txns24h":
      return a.calculated.txns24h;
    case "buys24h":
      return a.pair.txns.h24?.buys ?? null;
    case "sells24h":
      return a.pair.txns.h24?.sells ?? null;
    case "pairAgeHours":
      return a.calculated.pairAgeHours;
    case "priceChange24h":
      return a.pair.priceChange.h24;
    case "volatility":
      return a.calculated.volatilityProxy;
    case "vlRatio":
      return a.calculated.volumeToLiquidity24h;
    case "risk":
      return a.risk.score;
    case "confidence":
      return a.confidence.score;
    case "anomalies":
      return a.anomalies.length;
    case "freshnessSeconds":
      return a.confidence.freshnessSeconds;
    case "boosts":
      return a.pair.boostsActive ?? 0;
    case "hasProfile":
      return a.pair.hasProfile;
  }
}

function testCondition(a: Assessment, c: Condition): boolean {
  const v = fieldValue(a, c.field);
  let result: boolean;
  if (v === null || v === undefined) result = false;
  else if (typeof v === "boolean") result = String(v) === c.value.toLowerCase();
  else if (typeof v === "string") result = c.op === "eq" ? v.toLowerCase() === c.value.toLowerCase() : v.toLowerCase().includes(c.value.toLowerCase());
  else {
    const n = Number(c.value);
    if (!Number.isFinite(n)) result = false;
    else result = c.op === "gt" ? v > n : c.op === "lt" ? v < n : v === n;
  }
  return c.negate ? !result : result;
}

export function evaluateGroup(a: Assessment, g: Group): boolean {
  const parts = [...g.conditions.map((c) => testCondition(a, c)), ...g.groups.map((sub) => evaluateGroup(a, sub))];
  if (!parts.length) return true;
  return g.combinator === "AND" ? parts.every(Boolean) : parts.some(Boolean);
}

export function FilterBuilder({
  group,
  onChange,
  matching,
  total,
}: {
  group: Group;
  onChange: (g: Group) => void;
  matching: number;
  total: number;
}) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  useEffect(() => {
    setPresets(getPresets());
    return subscribeStore(() => setPresets(getPresets()));
  }, []);

  return (
    <div className="space-y-3">
      <GroupEditor group={group} onChange={onChange} depth={0} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="label-xs">MATCHING CONDITIONS</p>
          <p className="num text-2xl text-cyan">{matching.toLocaleString()}</p>
          <p className="label-xs">of {total.toLocaleString()} loaded observations</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const name = window.prompt("Preset name");
              if (name) savePreset(name, JSON.stringify(group));
            }}
            className="num flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
          >
            <Save className="h-3 w-3" /> SAVE PRESET
          </button>
          {presets.map((p) => (
            <span key={p.id} className="num flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.1em]">
              <button onClick={() => onChange(JSON.parse(p.json) as Group)} className="text-muted-foreground hover:text-cyan">
                {p.name}
              </button>
              <button onClick={() => deletePreset(p.id)} aria-label="Delete preset" className="text-unknown hover:text-signal-extreme">
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupEditor({ group, onChange, depth }: { group: Group; onChange: (g: Group) => void; depth: number }) {
  const fieldKind = useMemo(() => Object.fromEntries(FIELDS.map((f) => [f.value, f.kind])) as Record<Field, string>, []);

  return (
    <div className={cn("rounded-md border border-border/70 p-3", depth > 0 && "bg-background/30")}>
      <div className="mb-2 flex items-center gap-2">
        {(["AND", "OR"] as const).map((c) => (
          <button
            key={c}
            onClick={() => onChange({ ...group, combinator: c })}
            className={cn(
              "num rounded-sm border px-2 py-0.5 text-[10px] tracking-[0.14em]",
              group.combinator === c ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-border text-muted-foreground",
            )}
          >
            {c}
          </button>
        ))}
        <button
          onClick={() =>
            onChange({ ...group, conditions: [...group.conditions, { id: uid(), field: "liquidity", op: "gt", value: "50000", negate: false }] })
          }
          className="num flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
        >
          <Plus className="h-3 w-3" /> CONDITION
        </button>
        <button
          onClick={() => onChange({ ...group, groups: [...group.groups, emptyGroup()] })}
          className="num rounded-sm border border-border px-2 py-0.5 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
        >
          + GROUP
        </button>
      </div>

      <div className="space-y-2">
        {group.conditions.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onChange({ ...group, conditions: group.conditions.map((x) => (x.id === c.id ? { ...x, negate: !x.negate } : x)) })}
              className={cn(
                "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                c.negate ? "border-signal-high/60 text-signal-high" : "border-border text-unknown",
              )}
            >
              NOT
            </button>
            <select
              value={c.field}
              onChange={(e) => onChange({ ...group, conditions: group.conditions.map((x) => (x.id === c.id ? { ...x, field: e.target.value as Field } : x)) })}
              className="num rounded-sm border border-input bg-background/70 px-2 py-1 text-[11px]"
            >
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={c.op}
              onChange={(e) => onChange({ ...group, conditions: group.conditions.map((x) => (x.id === c.id ? { ...x, op: e.target.value as Op } : x)) })}
              className="num rounded-sm border border-input bg-background/70 px-2 py-1 text-[11px]"
            >
              {fieldKind[c.field] === "number" ? (
                <>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="eq">=</option>
                </>
              ) : (
                <>
                  <option value="contains">contains</option>
                  <option value="eq">equals</option>
                </>
              )}
            </select>
            <input
              value={c.value}
              onChange={(e) => onChange({ ...group, conditions: group.conditions.map((x) => (x.id === c.id ? { ...x, value: e.target.value } : x)) })}
              className="num w-32 rounded-sm border border-input bg-background/70 px-2 py-1 text-[11px]"
            />
            <button
              onClick={() => onChange({ ...group, conditions: group.conditions.filter((x) => x.id !== c.id) })}
              aria-label="Remove condition"
              className="text-unknown hover:text-signal-extreme"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {group.groups.map((sub) => (
          <div key={sub.id} className="flex items-start gap-2">
            <div className="flex-1">
              <GroupEditor group={sub} onChange={(g) => onChange({ ...group, groups: group.groups.map((x) => (x.id === sub.id ? g : x)) })} depth={depth + 1} />
            </div>
            <button
              onClick={() => onChange({ ...group, groups: group.groups.filter((x) => x.id !== sub.id) })}
              aria-label="Remove group"
              className="mt-3 text-unknown hover:text-signal-extreme"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
