import { describe, expect, it } from "vitest";
import { classifyMeme, keepMemesOnly } from "./classify";
import { changeEvent, dedupe, dedupKey, discoveryEvent, relativeChange, shouldTriggerResearch } from "../events/model";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const base = {
  chainId: "solana",
  dexId: "raydium",
  baseSymbol: "MOG",
  baseName: "Mog Coin",
  marketCapUsd: 400_000,
  fdvUsd: 400_000,
  liquidityUsd: 90_000,
  pairCreatedAt: NOW - 2 * DAY,
  now: NOW,
};

describe("meme classifier", () => {
  it("keeps a young small-cap Solana meme", () => {
    const r = classifyMeme(base);
    expect(r.verdict).toBe("MEME");
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("excludes majors and stablecoins by symbol", () => {
    for (const s of ["BTC", "ETH", "SOL", "USDC", "USDT", "LINK"]) {
      expect(classifyMeme({ ...base, baseSymbol: s }).verdict).toBe("NOT MEME");
    }
  });

  it("excludes wrapped and liquid-staking assets by name", () => {
    expect(classifyMeme({ ...base, baseSymbol: "XSOL", baseName: "Staked SOL receipt" }).verdict).toBe("NOT MEME");
  });

  it("excludes chains outside the meme universe", () => {
    expect(classifyMeme({ ...base, chainId: "osmosis" }).verdict).toBe("NOT MEME");
  });

  it("excludes valuations above the meme ceiling", () => {
    expect(classifyMeme({ ...base, marketCapUsd: 5e9, fdvUsd: 5e9 }).verdict).toBe("NOT MEME");
  });

  it("treats Pump.fun origin as strong evidence", () => {
    const r = classifyMeme({ ...base, dexId: null, marketCapUsd: null, fdvUsd: null, pairCreatedAt: null, pumpfunOrigin: true });
    expect(r.verdict).toBe("MEME");
  });

  it("returns UNKNOWN rather than guessing when key fields are missing", () => {
    const r = classifyMeme({
      chainId: "solana",
      dexId: null,
      baseSymbol: "NEW",
      baseName: null,
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      pairCreatedAt: null,
      now: NOW,
    });
    expect(r.verdict).toBe("UNKNOWN");
    expect(r.missing).toContain("market cap / FDV");
  });

  it("filters a mixed list down to memes only", () => {
    const rows = [base, { ...base, baseSymbol: "BTC" }, { ...base, baseSymbol: "USDC" }];
    expect(keepMemesOnly(rows, NOW)).toHaveLength(1);
  });
});

describe("event model", () => {
  it("does not emit an event for an unchanged value", () => {
    expect(
      changeEvent({
        kind: "LIQUIDITY_CHANGED",
        entityKind: "TOKEN",
        entityId: "solana:abc",
        source: "dexscreener",
        field: "liquidity_usd",
        before: 100_000,
        after: 100_000,
        observedAt: NOW,
      }),
    ).toBeNull();
  });

  it("does not emit an event below the field threshold", () => {
    expect(
      changeEvent({
        kind: "LIQUIDITY_CHANGED",
        entityKind: "TOKEN",
        entityId: "solana:abc",
        source: "dexscreener",
        field: "liquidity_usd",
        before: 100_000,
        after: 105_000,
        observedAt: NOW,
      }),
    ).toBeNull();
  });

  it("emits an event with before/after and a real change percentage", () => {
    const e = changeEvent({
      kind: "VOLUME_CHANGED",
      entityKind: "TOKEN",
      entityId: "solana:abc",
      source: "dexscreener",
      field: "volume_24h_usd",
      before: 100_000,
      after: 300_000,
      observedAt: NOW,
    });
    expect(e).not.toBeNull();
    expect(e!.changePct).toBeCloseTo(2);
    expect(e!.severity).toBe("CRITICAL");
    expect(e!.observedAt).toBe(NOW);
  });

  it("never treats a first observation as a change", () => {
    expect(
      changeEvent({
        kind: "PRICE_CHANGED",
        entityKind: "TOKEN",
        entityId: "solana:abc",
        source: "dexscreener",
        field: "price_usd",
        before: null,
        after: 0.002,
        observedAt: NOW,
      }),
    ).toBeNull();
  });

  it("refuses to express growth from zero as a ratio", () => {
    expect(relativeChange(0, 500)).toBeNull();
  });

  it("collapses duplicate events within the same minute", () => {
    const mk = (after: number) =>
      changeEvent({
        kind: "VOLUME_CHANGED",
        entityKind: "TOKEN",
        entityId: "solana:abc",
        source: "dexscreener",
        field: "volume_24h_usd",
        before: 100_000,
        after,
        observedAt: NOW,
      })!;
    const out = dedupe([mk(200_000), mk(400_000)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.afterValue).toBe(400_000);
  });

  it("builds stable dedup keys per minute bucket", () => {
    const a = dedupKey({ kind: "VOLUME_CHANGED", entityId: "x", field: "v", at: NOW });
    const b = dedupKey({ kind: "VOLUME_CHANGED", entityId: "x", field: "v", at: NOW + 1_000 });
    const c = dedupKey({ kind: "VOLUME_CHANGED", entityId: "x", field: "v", at: NOW + 90_000 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("triggers research on discovery and on large moves only", () => {
    const disc = discoveryEvent({ entityKind: "TOKEN", entityId: "solana:abc", source: "pumpfun", observedAt: NOW, summary: "new token" });
    expect(shouldTriggerResearch(disc)).toBe(true);

    const small = changeEvent({
      kind: "VOLUME_CHANGED",
      entityKind: "TOKEN",
      entityId: "solana:abc",
      source: "dexscreener",
      field: "volume_24h_usd",
      before: 100_000,
      after: 150_000,
      observedAt: NOW,
    })!;
    expect(shouldTriggerResearch(small)).toBe(false);
  });
});
