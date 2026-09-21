/**
 * NARRATIVE ENGINE (pure, deterministic, testable)
 *
 * A narrative is a recurring meme theme shared by several tokens. It is only
 * declared when enough independent tokens actually carry the theme. With thin
 * evidence the result is an empty list — never an invented trend.
 */

export type NarrativeSeed = {
  /** Canonical theme key, e.g. "cat". */
  theme: string;
  /** Words/roots that indicate the theme in a token symbol or name. */
  terms: string[];
};

/** Themes are explicit so a reader can audit why a token was grouped. */
export const NARRATIVE_SEEDS: NarrativeSeed[] = [
  { theme: "dog", terms: ["dog", "doge", "shib", "inu", "wif", "bonk"] },
  { theme: "cat", terms: ["cat", "kitty", "meow", "popcat", "mew"] },
  { theme: "frog", terms: ["pepe", "frog", "toad"] },
  { theme: "politics", terms: ["trump", "maga", "boden", "kamala", "elect"] },
  { theme: "ai", terms: ["ai", "gpt", "agent", "robot", "neural"] },
  { theme: "space", terms: ["moon", "mars", "rocket", "star", "cosmo"] },
  { theme: "food", terms: ["burger", "pizza", "banana", "peanut", "taco"] },
];

export type NarrativeTokenInput = {
  tokenId: string;
  symbol: string | null;
  name: string | null;
  /** Mentions in the current window, when a social provider supplied them. */
  mentions1h: number | null;
  mentions1hPrior: number | null;
  firstObservedAt: number | null;
  latestObservedAt: number | null;
};

export type Narrative = {
  theme: string;
  tokenIds: string[];
  /** Matched labels, so the grouping is explainable. */
  matched: string[];
  /** Null when no social provider supplied mentions for any member token. */
  accelerationPct: number | null;
  firstObservedAt: number | null;
  latestObservedAt: number | null;
  /** Data the engine needed and did not have. */
  missing: string[];
};

/** A theme needs this many distinct tokens before it counts as a narrative. */
export const MIN_TOKENS_PER_NARRATIVE = 3;

function matchesTheme(label: string, seed: NarrativeSeed): boolean {
  return seed.terms.some((t) => label.includes(t));
}

export function detectNarratives(
  tokens: NarrativeTokenInput[],
  seeds: NarrativeSeed[] = NARRATIVE_SEEDS,
): Narrative[] {
  const out: Narrative[] = [];

  for (const seed of seeds) {
    const members = tokens.filter((t) =>
      matchesTheme(`${t.symbol ?? ""} ${t.name ?? ""}`.toLowerCase(), seed),
    );
    if (members.length < MIN_TOKENS_PER_NARRATIVE) continue;

    const missing: string[] = [];
    let now = 0;
    let prior = 0;
    let haveSocial = false;
    for (const m of members) {
      if (m.mentions1h !== null && m.mentions1hPrior !== null) {
        now += m.mentions1h;
        prior += m.mentions1hPrior;
        haveSocial = true;
      }
    }
    if (!haveSocial) missing.push("social mentions for any member token");

    const accelerationPct = haveSocial && prior > 0 ? (now - prior) / prior : null;
    if (haveSocial && prior === 0) missing.push("a prior hour with mentions to compare against");

    const firsts = members.map((m) => m.firstObservedAt).filter((v): v is number => v !== null);
    const lasts = members.map((m) => m.latestObservedAt).filter((v): v is number => v !== null);
    if (!firsts.length) missing.push("first observation times");

    out.push({
      theme: seed.theme,
      tokenIds: members.map((m) => m.tokenId),
      matched: members.map((m) => m.symbol ?? m.tokenId),
      accelerationPct,
      firstObservedAt: firsts.length ? Math.min(...firsts) : null,
      latestObservedAt: lasts.length ? Math.max(...lasts) : null,
      missing,
    });
  }

  // Strongest measured acceleration first; unmeasured narratives sort last.
  return out.sort((a, b) => (b.accelerationPct ?? -Infinity) - (a.accelerationPct ?? -Infinity));
}
