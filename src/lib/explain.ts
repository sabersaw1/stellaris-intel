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
  {
    key: "market-cap",
    title: "Market capitalisation",
    meaning: "The reported value of the circulating supply at the last observed price.",
    calculation: "Taken as reported by the venue. Where the venue reports only fully diluted value, that is what is shown and labelled as such.",
    source: "DEX Screener.",
    freshness: "As of the observation time shown next to the figure.",
    limitations: "Supply figures for new meme tokens are frequently wrong, and a single thin trade can move the price used in the figure.",
    doesNotMean: "It is not money that exists, and it is not the amount that could be sold.",
    observedFact: "A number was reported by the venue at a recorded time.",
    interpretation: "Treating it as the token's worth is an inference, and a weak one for thin markets.",
  },
  {
    key: "volume",
    title: "Volume (24h)",
    meaning: "The value of trades reported in the trailing 24 hours.",
    calculation: "Reported by the venue and stored as-is; the previous stored value is kept so changes can be measured.",
    source: "DEX Screener.",
    freshness: "Trailing window ending at the observation time.",
    limitations: "Volume can be produced by the same participant trading with itself; nothing here proves independent demand.",
    doesNotMean: "High volume does not mean many buyers and does not mean the price will continue.",
    observedFact: "A traded value was reported for a 24-hour window.",
    interpretation: "Calling it interest or demand is an inference.",
  },
  {
    key: "holder-concentration",
    title: "Holder concentration",
    meaning: "How much of the supply sits in the largest wallets.",
    calculation: "Requires an on-chain holder read. When that read is unavailable the figure stays UNKNOWN and is never estimated.",
    source: "Solana RPC or an indexer, when connected.",
    freshness: "As of the last successful on-chain read.",
    limitations: "One person can hold many wallets, and exchange or pool wallets can look like a single large holder.",
    doesNotMean: "Low measured concentration does not mean the supply is genuinely distributed.",
    observedFact: "Balances of specific addresses at a specific slot.",
    interpretation: "Mapping addresses to people, or to intent, is an inference.",
  },
  {
    key: "buys-vs-sells",
    title: "Buys vs sells",
    meaning: "The count of buy-side and sell-side transactions reported in a window.",
    calculation: "Counts are taken as reported. Imbalance is the difference between the two counts, shown with both raw counts.",
    source: "DEX Screener.",
    freshness: "As of the observation that produced the counts.",
    limitations: "Counts ignore size, so a thousand tiny buys can hide one large sell.",
    doesNotMean: "An imbalance is not pressure, and not a direction forecast.",
    observedFact: "Two transaction counts for a stated window.",
    interpretation: "Reading them as sentiment is an inference.",
  },
  {
    key: "wallet-activity",
    title: "Wallet activity",
    meaning: "A specific address was observed transacting on a token.",
    calculation: "Only recorded when an on-chain read confirms the transaction. A report without on-chain confirmation is stored as REPORTED — UNVERIFIED.",
    source: "Solana RPC for confirmation; social or trader feeds for reports.",
    freshness: "Only while an on-chain connection exists; gaps are recorded as gaps.",
    limitations: "Without a connected on-chain source there is no verification at all.",
    doesNotMean: "Activity by a wallet is not a signal, and the wallet's identity is not known.",
    observedFact: "A transaction involving an address and a token at a slot.",
    interpretation: "Who controls the wallet, and why they acted, is unknown.",
  },
  {
    key: "trader-activity",
    title: "Trader activity",
    meaning: "A profile that a third party labels a notable trader was reported acting.",
    calculation: "Stored as a report attributed to its source, and only upgraded to verified when an on-chain read matches it.",
    source: "FOMO or a similar trader feed, when connected.",
    freshness: "Only as fresh as the reporting feed; the report time is stored separately from receipt time.",
    limitations: "The label 'notable trader' comes from the third party, not from Stellaris.",
    doesNotMean: "It is not proof the trade happened and not a reason to copy it.",
    observedFact: "A third party published a claim at a recorded time.",
    interpretation: "Whether the trader is skilled, and whether the claim is true, is an inference.",
  },
  {
    key: "momentum",
    title: "Momentum",
    meaning: "The direction and size of change between consecutive stored observations.",
    calculation: "Relative change between the previous stored value and the newest one, per field. Two observations are required; one observation produces UNKNOWN.",
    source: "Stored observations only.",
    freshness: "Bounded by the gap between the two observations used, both of which are shown.",
    limitations: "Polling gaps mean short moves between observations are invisible.",
    doesNotMean: "It is not a trend, a forecast or a continuation signal.",
    observedFact: "Two stored values and the time between them.",
    interpretation: "Calling it a trend is an inference.",
  },
  {
    key: "volatility",
    title: "Volatility",
    meaning: "How widely an observed value moved across the stored window.",
    calculation: "Spread of stored observations within the window. Fewer than three observations returns INSUFFICIENT EVIDENCE.",
    source: "Stored observations only.",
    freshness: "Limited to the stored window, which is stated with the figure.",
    limitations: "Uneven polling makes this a rough measure, not an exchange-grade statistic.",
    doesNotMean: "It is not risk, and it is not a probability.",
    observedFact: "A set of values with timestamps.",
    interpretation: "Turning the spread into expected future movement is an inference.",
  },
  {
    key: "token-age",
    title: "Token age",
    meaning: "How long ago the pair or token was first observed to exist.",
    calculation: "From the venue's reported creation time when present; otherwise from the first Stellaris observation, which is labelled as such.",
    source: "DEX Screener, or Stellaris's own first observation.",
    freshness: "Fixed once known.",
    limitations: "First observation is not creation; a token can exist long before Stellaris sees it.",
    doesNotMean: "Age is not legitimacy, and newness is not opportunity.",
    observedFact: "A creation timestamp, or a first-seen timestamp.",
    interpretation: "Which one it is matters, and the label says which.",
  },
  {
    key: "liquidity-change",
    title: "Liquidity change",
    meaning: "The pool value reported for a pair moved between two stored observations.",
    calculation: "Relative change against the previous stored value, raised as an event only past its threshold.",
    source: "DEX Screener.",
    freshness: "Both observation times are kept with the event.",
    limitations: "A pool can be drained between two observations and partly refilled, leaving a small apparent change.",
    doesNotMean: "A drop is not proof of a rug, and a rise is not proof of commitment.",
    observedFact: "Two pool values and their times.",
    interpretation: "Intent behind the change is unknown.",
  },
  {
    key: "risk-signals",
    title: "Risk signals",
    meaning: "Named, individually checkable conditions such as thin liquidity, supply concentration or retained mint authority.",
    calculation: "Each signal is an explicit rule over stored evidence, listed separately. Signals are never summed into one number.",
    source: "The stored evidence each rule needs; a rule with no evidence reports UNKNOWN.",
    freshness: "Each signal carries the time of the evidence it used.",
    limitations: "Absence of signals mostly means absence of evidence.",
    doesNotMean: "No signals does not mean safe, and a signal does not mean fraud.",
    observedFact: "The rule fired on stated evidence.",
    interpretation: "How dangerous that is remains a human judgement.",
  },
  {
    key: "confidence",
    title: "Confidence",
    meaning: "How much weight the stored evidence can carry, given its completeness, freshness and source count.",
    calculation: "From explicit inputs: number of observations, age of the newest observation, number of independent sources, and how many required fields are missing.",
    source: "The evidence record itself, not a model.",
    freshness: "Recomputed whenever the evidence changes.",
    limitations: "Confidence in evidence is not confidence in an outcome.",
    doesNotMean: "It is not a probability that a trade would work.",
    observedFact: "Counts and timestamps of evidence.",
    interpretation: "Whether that is enough to act is the reader's call.",
  },
  {
    key: "corroboration",
    title: "Corroboration",
    meaning: "How many independent sources observed the same real-world change.",
    calculation: "One real change is stored once, with every observing provider kept as provenance. States are REPORTED (one source), CROSS-VERIFIED (two or more independent sources) and ON-CHAIN VERIFIED (confirmed by an on-chain read).",
    source: "The provenance list on the event.",
    freshness: "Each provenance entry keeps its own observation time.",
    limitations: "Two providers that both resell the same upstream feed are not independent, and are not counted as two.",
    doesNotMean: "Cross-verified does not mean correct; it means several sources agree.",
    observedFact: "Which providers reported the change, and when.",
    interpretation: "Independence and reliability of those providers is a judgement.",
  },
  {
    key: "unknown-data",
    title: "Unknown data",
    meaning: "The evidence needed for a statement does not exist in storage.",
    calculation: "Never filled in, never defaulted to zero, never averaged away. The screen names the missing field and the connection that would supply it.",
    source: "The absence itself is recorded, with the reason.",
    freshness: "Rechecked on every read.",
    limitations: "Unknown is the honest answer, and it is common for new meme tokens.",
    doesNotMean: "Unknown does not mean zero, safe, or bad.",
    observedFact: "The field was requested and not available.",
    interpretation: "None is offered; that is the point.",
  },
];


export function explanationFor(key: string): Explanation | null {
  return EXPLANATIONS.find((e) => e.key === key) ?? null;
}
