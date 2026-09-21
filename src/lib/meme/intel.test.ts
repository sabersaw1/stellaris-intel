import { describe, expect, it } from "vitest";

import { detectNarratives, MIN_TOKENS_PER_NARRATIVE } from "./narrative";
import { buildEntityGraph, neighboursOfToken } from "./graph";
import { normalizeFomoTrade, usableFomoObservations } from "./fomo-normalize";
import { EXPLANATIONS, explanationFor } from "../explain";

const tok = (id: string, symbol: string, extra: Partial<Parameters<typeof detectNarratives>[0][number]> = {}) => ({
  tokenId: id,
  symbol,
  name: symbol,
  mentions1h: null,
  mentions1hPrior: null,
  firstObservedAt: 1_000,
  latestObservedAt: 2_000,
  ...extra,
});

describe("narrative engine", () => {
  it("does not invent a narrative from too few tokens", () => {
    expect(detectNarratives([tok("a", "CATWIF"), tok("b", "MEOW")])).toEqual([]);
  });

  it("groups tokens that share an explicit theme", () => {
    const out = detectNarratives([tok("a", "POPCAT"), tok("b", "MEOW"), tok("c", "KITTY"), tok("d", "PEPE")]);
    expect(out).toHaveLength(1);
    expect(out[0]?.theme).toBe("cat");
    expect(out[0]?.tokenIds).toHaveLength(MIN_TOKENS_PER_NARRATIVE);
  });

  it("reports acceleration as unknown when no social data exists", () => {
    const out = detectNarratives([tok("a", "DOGE"), tok("b", "SHIB"), tok("c", "INU")]);
    expect(out[0]?.accelerationPct).toBeNull();
    expect(out[0]?.missing.join(" ")).toContain("social mentions");
  });

  it("measures acceleration when both windows are observed", () => {
    const out = detectNarratives([
      tok("a", "DOGE", { mentions1h: 20, mentions1hPrior: 10 }),
      tok("b", "SHIB", { mentions1h: 10, mentions1hPrior: 10 }),
      tok("c", "INU", { mentions1h: 10, mentions1hPrior: 0 }),
    ]);
    expect(out[0]?.accelerationPct).toBeCloseTo(1); // 40 vs 20
  });
});

describe("entity graph", () => {
  const graph = buildEntityGraph({
    accounts: [{ id: "x1", handle: "alpha", traderId: "t1", source: "x", observedAt: 1 }],
    traders: [{ id: "t1", label: "alpha", source: "fomo" }],
    wallets: [{ id: "w1", address: "Abc", traderId: "t1", source: "fomo", observedAt: 2 }],
    walletTrades: [
      { walletId: "w1", tokenId: "tok1", source: "fomo", observedAt: 3 },
      { walletId: "w1", tokenId: "tok1", source: "fomo", observedAt: 4 },
    ],
    tokens: [{ id: "tok1", label: "POPCAT" }],
    pairs: [{ id: "p1", label: "POPCAT/SOL", tokenId: "tok1" }],
    narratives: [{ theme: "cat", tokenIds: ["tok1"] }],
  });

  it("never duplicates an edge when the same relation is observed twice", () => {
    expect(graph.edges.filter((e) => e.relation === "TRADED")).toHaveLength(1);
  });

  it("links account -> trader -> wallet -> token -> pair -> narrative", () => {
    const relations = graph.edges.map((e) => e.relation).sort();
    expect(relations).toEqual(["BELONGS_TO", "CONTROLS", "OPERATES", "QUOTES", "TRADED"]);
  });

  it("keeps a source on every edge", () => {
    expect(graph.edges.every((e) => Boolean(e.source))).toBe(true);
  });

  it("finds a token's neighbours", () => {
    const kinds = neighboursOfToken(graph, "tok1").map((n) => n.kind).sort();
    expect(kinds).toEqual(["NARRATIVE", "PAIR", "WALLET"]);
  });
});

describe("FOMO normalisation", () => {
  it("never marks a reported trade verified", () => {
    const o = normalizeFomoTrade({ side: "buy", mint: "M", timestamp: 1_700_000_000, signature: "sig" });
    expect(o.verified).toBe(false);
    expect(o.sourceConfidence).toBe("REPORTED — UNVERIFIED");
    expect(o.reportedBy).toBe("fomo");
  });

  it("keeps missing fields null and names them", () => {
    const o = normalizeFomoTrade({ mint: "M", timestamp: 1_700_000_000_000 });
    expect(o.valueUsd).toBeNull();
    expect(o.action).toBe("UNKNOWN");
    expect(o.missing).toContain("buy/sell direction");
    expect(o.missing).toContain("wallet address");
  });

  it("converts second-precision timestamps to milliseconds", () => {
    expect(normalizeFomoTrade({ timestamp: 1_700_000_000 }).observedAt).toBe(1_700_000_000_000);
  });

  it("discards reports that cannot be placed on a token or timeline", () => {
    const { usable, discarded } = usableFomoObservations([{ side: "buy" }, { mint: "M" }]);
    expect(usable).toHaveLength(0);
    expect(discarded).toHaveLength(2);
  });

  it("deduplicates repeated reports of the same transaction", () => {
    const row = { side: "sell", mint: "M", timestamp: 1_700_000_000, signature: "sig" };
    const { usable, discarded } = usableFomoObservations([row, { ...row }]);
    expect(usable).toHaveLength(1);
    expect(discarded[0]?.reason).toContain("duplicate");
  });
});

describe("explain directory", () => {
  it("states what each metric does NOT mean", () => {
    expect(EXPLANATIONS.every((e) => e.doesNotMean.trim().length > 10)).toBe(true);
  });

  it("documents that execution is disabled", () => {
    expect(explanationFor("execution")?.calculation).toContain("disabled");
  });

  it("returns null for an unknown key rather than guessing", () => {
    expect(explanationFor("nope")).toBeNull();
  });
});
