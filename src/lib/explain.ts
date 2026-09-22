/**
 * EXPLAIN DIRECTORY
 *
 * Every metric the interface shows has an entry here: what it means, how it is
 * calculated, where the data comes from, how fresh it can be, what its limits
 * are, and — importantly — what it does NOT mean.
 */

export type Explanation = {
  key: string;
  title: string;
  meaning: string;
  calculation: string;
  source: string;
  freshness: string;
  limitations: string;
  doesNotMean: string;
  /** What is literally observed and recorded, with no reasoning applied. */
  observedFact?: string;
  /** What a reader may reasonably infer — clearly separated from the fact. */
  interpretation?: string;
};


export const EXPLANATIONS: Explanation[] = [
  {
    key: "meme-verdict",
    title: "Meme verdict",
    meaning: "Whether a market belongs in the meme research universe: MEME, NOT MEME or UNKNOWN.",
    calculation:
      "Explicit rules only: known majors, stablecoins, wrapped and staking assets are excluded; valuation above $2B is excluded; chain, venue, launch origin, valuation and pair age add evidence. Three points of evidence are required for MEME.",
    source: "DEX Screener pair data, plus Pump.fun launch origin when that source is connected.",
    freshness: "Recalculated on every observation of the pair.",
    limitations: "A market whose symbol, valuation or age is missing stays UNKNOWN rather than being guessed into the universe.",
    doesNotMean: "It is not a quality, safety or profitability judgement.",
  },
  {
    key: "liquidity",
    title: "Liquidity (USD)",
    meaning: "The value reported as available in the trading pool.",
    calculation: "Taken directly from the venue's reported pool value; never derived or estimated.",
    source: "DEX Screener.",
    freshness: "As fresh as the last stored observation; the screen always shows that observation time.",
    limitations: "Pool value can be withdrawn instantly and can be inflated by the pool creator.",
    doesNotMean: "It does not mean you can exit a position of that size at the quoted price.",
  },
  {
    key: "event-threshold",
    title: "Change event",
    meaning: "A stored value actually moved by more than its defined threshold.",
    calculation:
      "Relative change between the previous stored value and the new one, compared against a per-field threshold (for example liquidity 15%, 24h volume 40%, price 10%). Events within the same minute for the same field collapse into one.",
    source: "Stored observations only; never a live guess.",
    freshness: "Created at observation time, with both the source time and the receipt time kept.",
    limitations: "A first observation is a discovery, not a change. Growth from zero has no ratio and produces no change event.",
    doesNotMean: "An event is not a signal to act, and not a prediction.",
  },
  {
    key: "supporting-contradicting-unknown",
    title: "Supporting / contradicting / unknown",
    meaning: "Independent analysts report separately, and their disagreement is kept visible.",
    calculation:
      "Market, on-chain, trader, social, token-risk and history analysts each read only the evidence they are competent to judge and return one stance. Stances are listed, never averaged.",
    source: "Stored observations for each analyst's domain.",
    freshness: "Produced at the moment you request research, from the newest stored observations.",
    limitations: "An analyst with no data returns UNAVAILABLE and names what is missing.",
    doesNotMean: "There is no single blended score, and no recommendation to buy or sell.",
  },
  {
    key: "wallet-verification",
    title: "Verified wallet observation",
    meaning: "Whether a reported trade has been independently confirmed on-chain.",
    calculation: "A reported trade stays unverified until an on-chain read matches its transaction. The reporting source is recorded separately from verification.",
    source: "Social trading feeds report; a Solana RPC or indexer verifies.",
    freshness: "Verification happens only when an on-chain connection exists.",
    limitations: "Without an on-chain connection every reported trade remains unverified evidence.",
    doesNotMean: "A reported trade is not proof that the trade happened.",
  },
  {
    key: "narrative",
    title: "Narrative",
    meaning: "A recurring meme theme shared by several tokens at once.",
    calculation: "Tokens are grouped by explicit theme terms found in their symbol or name. A theme needs at least three distinct tokens before it is reported. Acceleration needs social mentions for a current and a prior hour.",
    source: "Stored token identities, plus social mentions when a social provider is connected.",
    freshness: "Recomputed from stored tokens on each read.",
    limitations: "Without social data a narrative has no acceleration figure, which is shown as unknown rather than zero.",
    doesNotMean: "A detected theme is not evidence that the theme is profitable.",
  },
  {
    key: "research-state",
    title: "Research state",
    meaning: "Where a candidate stands in the research process.",
    calculation:
      "Derived from the analysts' stances: fewer than two answering analysts gives INSUFFICIENT DATA; risk alone gives REJECTED — RISK; more contradiction than support gives DETERIORATING; disagreement or many unknowns gives INTERESTING — HIGH UNCERTAINTY.",
    source: "The analyst findings for that token.",
    freshness: "As of the moment the research pass ran, which is recorded on the dossier.",
    limitations: "It moves as evidence arrives, and the dossier lists exactly what would change it.",
    doesNotMean: "It is not a rating, a target or a trade instruction.",
  },
  {
    key: "execution",
    title: "Real-money execution",
    meaning: "Placing a live order with real funds.",
    calculation: "Not applicable: it is disabled in the permission layer, and no screen or endpoint can place an order.",
    source: "Permission layer.",
    freshness: "Permanent for this system.",
    limitations: "Proposals may be recorded for your review; they are never executed.",
    doesNotMean: "A recorded proposal does not mean anything was bought or sold.",
  },
];

export function explanationFor(key: string): Explanation | null {
  return EXPLANATIONS.find((e) => e.key === key) ?? null;
}
