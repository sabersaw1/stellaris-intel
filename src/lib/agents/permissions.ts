/**
 * AGENT PERMISSION LEVELS
 *
 * Architectural levels only. Real-money execution is hard-disabled in this
 * application: no permission level, API call, UI action or database row can
 * enable it. The guard below is the single decision point, so there is no
 * second path to bypass.
 */

export const PERMISSION_LEVELS = [
  "OBSERVER",
  "RESEARCHER",
  "PROPOSER",
  "PAPER_TRADER",
  "HUMAN_APPROVED_EXECUTOR",
  "AUTONOMOUS_EXECUTOR",
] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export type Capability = "READ" | "RESEARCH" | "PROPOSE" | "PAPER_TRADE" | "EXECUTE_REAL";

const GRANTS: Record<PermissionLevel, Capability[]> = {
  OBSERVER: ["READ"],
  RESEARCHER: ["READ", "RESEARCH"],
  PROPOSER: ["READ", "RESEARCH", "PROPOSE"],
  PAPER_TRADER: ["READ", "RESEARCH", "PROPOSE", "PAPER_TRADE"],
  HUMAN_APPROVED_EXECUTOR: ["READ", "RESEARCH", "PROPOSE", "PAPER_TRADE"],
  AUTONOMOUS_EXECUTOR: ["READ", "RESEARCH", "PROPOSE", "PAPER_TRADE"],
};

/** System-wide switch. Not configurable at runtime, by design. */
export const REAL_EXECUTION_HARD_DISABLED = true as const;

export type PermissionDecision = { allowed: boolean; reason: string };

export function can(level: PermissionLevel, capability: Capability): PermissionDecision {
  if (capability === "EXECUTE_REAL")
    return {
      allowed: false,
      reason: "Real-money execution is hard-disabled in STELLARIS. No permission level can grant it.",
    };
  const allowed = GRANTS[level].includes(capability);
  return {
    allowed,
    reason: allowed ? `${level} includes ${capability}.` : `${level} does not include ${capability}.`,
  };
}

/** Every proposal is advisory. This never returns an executable instruction. */
export function proposalOnly<T extends Record<string, unknown>>(proposal: T): T & { executed: false; executionAllowed: false; note: string } {
  return {
    ...proposal,
    executed: false,
    executionAllowed: false,
    note: "Proposal recorded for human review. STELLARIS does not place orders.",
  };
}
