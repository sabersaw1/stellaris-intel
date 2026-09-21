/**
 * PROVIDER REGISTRY (server-only).
 *
 * The single place the engine resolves a capability to a provider. Nothing else
 * imports adapters directly, so a source can be swapped or added without
 * touching intelligence logic.
 */

import { dexscreenerProvider } from "./dexscreener.provider.server";
import { fomoProvider } from "./fomo.server";
import { pumpfunProvider } from "./pumpfun.server";
import { solanaProvider } from "./solana.server";
import { xProvider } from "./x.server";
import { db, memeSchemaReady, saveProviderHealth } from "../stellaris/store.server";
import type { Capability, Provider, ProviderHealth, ProviderId } from "./types";

const PROVIDERS: Provider<never, never>[] = [
  dexscreenerProvider as unknown as Provider<never, never>,
  pumpfunProvider as unknown as Provider<never, never>,
  solanaProvider as unknown as Provider<never, never>,
  xProvider as unknown as Provider<never, never>,
  fomoProvider as unknown as Provider<never, never>,
];

export function allProviders(): Provider<never, never>[] {
  return PROVIDERS;
}

export function provider(id: ProviderId): Provider<never, never> | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

/** Providers that actually support a capability right now (credential present). */
export function providersFor(cap: Capability): Provider<never, never>[] {
  return PROVIDERS.filter((p) =>
    p.capabilities().some((c) => c.capability === cap && c.state === "SUPPORTED") && p.configured(),
  );
}

/** True when at least one configured provider can serve the capability. */
export function capabilityAvailable(cap: Capability): boolean {
  return providersFor(cap).length > 0;
}

export async function providerHealthReport(persist = true): Promise<ProviderHealth[]> {
  const report = await Promise.all(PROVIDERS.map((p) => p.health()));
  if (persist) {
    const client = db();
    if (client) {
      const schema = await memeSchemaReady(client);
      if (schema.ready) await Promise.all(report.map(saveProviderHealth));
    }
  }
  return report;
}

/**
 * Capability coverage for the CONNECTIONS surface: which capabilities the
 * system can serve today and which are blocked, with the exact reason.
 */
export function capabilityCoverage(): {
  capability: Capability;
  available: boolean;
  providers: { id: ProviderId; state: string; note: string; configured: boolean }[];
}[] {
  const caps = new Set<Capability>();
  for (const p of PROVIDERS) for (const c of p.capabilities()) caps.add(c.capability);
  return [...caps].sort().map((cap) => ({
    capability: cap,
    available: capabilityAvailable(cap),
    providers: PROVIDERS.flatMap((p) => {
      const c = p.capabilities().find((x) => x.capability === cap);
      return c ? [{ id: p.id, state: c.state, note: c.note, configured: p.configured() }] : [];
    }),
  }));
}
