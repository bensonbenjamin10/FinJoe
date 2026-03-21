import { FlatTaxCalculation, type TaxCalculationPort } from "./tax-calculation-port.js";
import { GstIndiaTax } from "./gst-india-tax.js";

export type TaxRegime = "flat_percent" | "gst_in" | "vat_ae" | string;

const registry = new Map<TaxRegime, (config: Record<string, unknown>) => TaxCalculationPort>();

registry.set("flat_percent", (_config) => new FlatTaxCalculation());
registry.set("gst_in", (config) => new GstIndiaTax(config));

export function registerTaxRegime(
  regime: TaxRegime,
  factory: (config: Record<string, unknown>) => TaxCalculationPort,
) {
  registry.set(regime, factory);
}

export function getTaxEngine(
  regime: TaxRegime,
  config: Record<string, unknown> = {},
): TaxCalculationPort {
  const factory = registry.get(regime);
  if (!factory) {
    return new FlatTaxCalculation();
  }
  return factory(config);
}

export function supportedRegimes(): TaxRegime[] {
  return [...registry.keys()];
}
