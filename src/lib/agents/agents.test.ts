import { describe, expect, it } from "vitest";
import {
  historicalAgent,
  marketAgent,
  onChainAgent,
  researchAgent,
  riskAgent,
  socialAgent,
  traderAgent,
  type AnalysisInput,
} from "./roles";
import { runFunnel } from "./funnel";
import { REAL_EXECUTION_HARD_DISABLED, can, proposalOnly, PERMISSION_LEVELS } from "./permissions";

const NOW = 1_800_000_000_000;

const base = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  tokenLabel: "TESTMEME",
  memeVerdict: "MEME",
  memeReasons: ["launched on a meme venue"],
  pairCreatedAt: NOW - 10 * 24 * 60 * 60 * 1000,
  latest: null,
  previous: null,
  chain: null,
  wallets: [],
  traderLabels: [],
  social: null,
  analogs: null,
  now: NOW,
  ...over,
});

const snap = (over: Record<string, number | null> = {}) => ({
  observedAt: NOW,
  priceUsd: 0.001,
  marketCapUsd: 500_000,
  liquidityUsd: 100_000,
  volume24hUsd: 200_000,
  volume5mUsd: 5_000,
  txns5mBuys: 30,
  txns5mSells: 10,
  holders: null,
  ...over,
});

describe("agents return UNAVAILABLE rather than guessing", () => {
  it("market agent without snapshots", () => {
    const f = marketAgent(base());
    expect(f.stance).toBe("UNAVAILABLE");
    expect(f.missing).toContain("token snapshot");
  });

  it("on-chain agent without an RPC connection", () => {
    const f = onChainAgent(base());
    expect(f.stance).toBe("UNAVAILABLE");
    expect(f.statement).toMatch(/Solana RPC/);
  });

  it("social agent without a connected provider", () => {
    expect(socialAgent(base()).stance).toBe("UNAVAILABLE");
  });

  it("trader agent without wallet observations", () => {
    expect(traderAgent(base()).stance).toBe("UNAVAILABLE");
  });

  it("historical agent without resolved analogs", () => {
    expect(historicalAgent(base()).stance).toBe("UNAVAILABLE");
  });
});

describe("market agent", () => {
  it("supports on expanding liquidity and volume", () => {
    const f = marketAgent(base({ latest: snap(), previous: snap({ liquidityUsd: 50_000, volume24hUsd: 80_000 }) }));
    expect(f.stance).toBe("SUPPORTING");
    expect(f.basis.join(" ")).toMatch(/liquidity \+/);
  });

  it("contradicts on collapsing liquidity", () => {
    const f = marketAgent(base({ latest: snap({ liquidityUsd: 20_000, volume24hUsd: 30_000, txns5mBuys: 5, txns5mSells: 40 }), previous: snap() }));
    expect(f.stance).toBe("CONTRADICTING");
  });

  it("never treats a missing field as zero", () => {
    const f = marketAgent(base({ latest: snap({ liquidityUsd: null }), previous: snap({ liquidityUsd: null }) }));
    expect(f.missing).toContain("liquidity");
    expect(f.basis.join(" ")).not.toMatch(/liquidity \$0/);
  });
});

describe("risk agent is independent of market opinion", () => {
  it("flags concentration and thin liquidity separately", () => {
    const input = base({
      latest: snap({ liquidityUsd: 4_000, marketCapUsd: 900_000 }),
      previous: snap({ liquidityUsd: 3_000 }),
      chain: { holders: 120, topHolderSharePct: 41, mintAuthorityPresent: false, freezeAuthorityPresent: false, source: "solana" },
    });
    const risk = riskAgent(input);
    const market = marketAgent(input);
    expect(risk.stance).toBe("CONTRADICTING");
    expect(market.stance).toBe("SUPPORTING");
  });
});

describe("agent disagreement is preserved", () => {
  it("keeps supporting and contradicting evidence, and reports uncertainty", () => {
    const d = researchAgent(
      base({
        latest: snap(),
        previous: snap({ liquidityUsd: 40_000, volume24hUsd: 60_000 }),
        chain: { holders: 30, topHolderSharePct: 44, mintAuthorityPresent: true, freezeAuthorityPresent: null, source: "solana" },
      }),
    );
    expect(d.supporting.length).toBeGreaterThan(0);
    expect(d.contradicting.length).toBeGreaterThan(0);
    expect(d.disagreement).toBe(true);
    expect(d.state).toBe("INTERESTING — HIGH UNCERTAINTY");
    expect(d.whatWouldChangeIt.length).toBeGreaterThan(0);
  });

  it("never emits a buy or sell instruction", () => {
    const d = researchAgent(base({ latest: snap(), previous: snap({ liquidityUsd: 10_000 }) }));
    const text = JSON.stringify(d).toUpperCase();
    expect(text).not.toMatch(/"BUY"|"SELL"|RECOMMEND/);
    expect(d.executionAllowed).toBe(false);
  });

  it("marks unverified third-party observations as unknown", () => {
    const d = researchAgent(
      base({
        latest: snap(),
        previous: snap({ liquidityUsd: 40_000 }),
        wallets: [{ wallet: "Wallet X", action: "BUY", observedAt: NOW - 60_000, source: "fomo", verified: false, amountUsd: null, txSignature: null }],
      }),
    );
    expect(d.unknown.join(" ")).toMatch(/verification/i);
    expect(d.whatWouldChangeIt.join(" ")).toMatch(/On-chain verification/);
  });

  it("requires a meme verdict before research can conclude", () => {
    const d = researchAgent(base({ memeVerdict: "UNKNOWN", latest: snap(), previous: snap({ liquidityUsd: 40_000 }) }));
    expect(d.state).toBe("INSUFFICIENT DATA");
  });
});

describe("historical agent avoids survivorship bias", () => {
  it("downgrades confidence when failures are excluded", () => {
    const f = historicalAgent(base({ analogs: { sampleSize: 40, survivedPct: 0.8, medianOutcomePct: 0.5, includesFailures: false } }));
    expect(f.confidence).toBe("POSSIBLE");
    expect(f.missing.join(" ")).toMatch(/survivorship/);
  });
});

describe("opportunity funnel", () => {
  it("blocks non-meme tokens at the meme filter with a reason", () => {
    const out = runFunnel(base({ memeVerdict: "NOT MEME", latest: snap() }));
    expect(out.blockedBy).toBe("MEME FILTER");
    expect(out.stages.at(-1)?.reason).toMatch(/NOT MEME/);
  });

  it("blocks when no snapshot is validated", () => {
    expect(runFunnel(base()).blockedBy).toBe("VALIDATED");
  });

  it("stops before deep research when no social or trader evidence exists", () => {
    const out = runFunnel(base({ latest: snap(), previous: snap({ liquidityUsd: 40_000 }) }));
    expect(out.blockedBy).toBe("SOCIAL/TRADER ANALYSIS");
  });

  it("reaches the human decision only with independent supporting evidence", () => {
    const out = runFunnel(
      base({
        latest: snap(),
        previous: snap({ liquidityUsd: 40_000, volume24hUsd: 60_000 }),
        chain: { holders: 900, topHolderSharePct: 6, mintAuthorityPresent: false, freezeAuthorityPresent: false, source: "solana" },
        social: { mentions1h: 90, mentions1hPrior: 20, uniqueAuthors1h: 44, source: "x" },
      }),
    );
    expect(out.reached).toBe("HUMAN DECISION");
    expect(out.stages.every((s) => s.reason.length > 0)).toBe(true);
  });
});

describe("permissions", () => {
  it("hard-disables real execution for every level", () => {
    expect(REAL_EXECUTION_HARD_DISABLED).toBe(true);
    for (const level of PERMISSION_LEVELS) {
      expect(can(level, "EXECUTE_REAL").allowed).toBe(false);
    }
  });

  it("scales read/research/propose/paper by level", () => {
    expect(can("OBSERVER", "RESEARCH").allowed).toBe(false);
    expect(can("RESEARCHER", "RESEARCH").allowed).toBe(true);
    expect(can("RESEARCHER", "PROPOSE").allowed).toBe(false);
    expect(can("PROPOSER", "PROPOSE").allowed).toBe(true);
    expect(can("PAPER_TRADER", "PAPER_TRADE").allowed).toBe(true);
  });

  it("marks every proposal as not executed", () => {
    const p = proposalOnly({ tokenId: "abc", direction: "LONG" });
    expect(p.executed).toBe(false);
    expect(p.executionAllowed).toBe(false);
  });
});
