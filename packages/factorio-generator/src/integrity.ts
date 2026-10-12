import { createHash } from "node:crypto";

import type { ModChange, ModSpec, NewMachineUnlock } from "@project/domain";

/**
 * Allowed difference for one `data.raw` prototype, keyed by `type/name`:
 * - a set of top-level properties that may change on an existing prototype;
 * - `"added"` for a prototype the ModSpec creates and the base game does not have.
 */
export type PrototypeAllowance = ReadonlySet<string> | "added";
export type PrototypeFootprint = ReadonlyMap<string, PrototypeAllowance>;

export interface PrototypeFingerprint {
  readonly digest: string;
  readonly properties: ReadonlyMap<string, string>;
}

/** Per-prototype digests of a Factorio `data-raw-dump.json`, keyed by `type/name`. */
export type DataRawFingerprint = ReadonlyMap<string, PrototypeFingerprint>;

const MAX_REPORTED_ADDRESSES = 20;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("base64");
}

export function fingerprintDataRaw(dump: unknown): DataRawFingerprint {
  if (dump === null || typeof dump !== "object" || Array.isArray(dump)) {
    throw new TypeError("data-raw dump must be an object of prototype types");
  }
  const fingerprint = new Map<string, PrototypeFingerprint>();
  for (const [type, prototypes] of Object.entries(dump as Record<string, unknown>)) {
    if (prototypes === null || typeof prototypes !== "object" || Array.isArray(prototypes)) continue;
    for (const [name, prototype] of Object.entries(prototypes as Record<string, unknown>)) {
      const properties = new Map<string, string>();
      if (prototype !== null && typeof prototype === "object" && !Array.isArray(prototype)) {
        for (const [property, value] of Object.entries(prototype as Record<string, unknown>)) {
          properties.set(property, digest(canonicalJson(value)));
        }
      }
      const summary = [...properties.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([property, value]) => `${property}=${value}`)
        .join("\n");
      fingerprint.set(`${type}/${name}`, {
        digest: digest(properties.size > 0 ? summary : canonicalJson(prototype)),
        properties,
      });
    }
  }
  return fingerprint;
}

function changedProperties(left: PrototypeFingerprint, right: PrototypeFingerprint): string[] {
  const names = new Set([...left.properties.keys(), ...right.properties.keys()]);
  return [...names].filter((name) => left.properties.get(name) !== right.properties.get(name)).sort();
}

/** Addresses (`type/name` or `type/name.property`) that differ between two fingerprints. */
export function diffDataRaw(left: DataRawFingerprint, right: DataRawFingerprint): string[] {
  const addresses: string[] = [];
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const before = left.get(key);
    const after = right.get(key);
    if (before === undefined || after === undefined) {
      addresses.push(key);
    } else if (before.digest !== after.digest) {
      addresses.push(...changedProperties(before, after).map((property) => `${key}.${property}`));
    }
  }
  return addresses.sort();
}

function allowProperties(footprint: Map<string, PrototypeAllowance>, key: string, properties: readonly string[]): void {
  const current = footprint.get(key);
  if (current === "added") return;
  footprint.set(key, new Set([...(current ?? []), ...properties]));
}

function allowUnlock(footprint: Map<string, PrototypeAllowance>, contentName: string, unlock: NewMachineUnlock): void {
  if (unlock.type === "existing_technology") {
    allowProperties(footprint, `technology/${unlock.technologyName}`, ["effects"]);
  } else {
    footprint.set(`technology/${contentName}-technology`, "added");
  }
}

function addChangeFootprint(footprint: Map<string, PrototypeAllowance>, change: ModChange): void {
  switch (change.type) {
    case "prototype_property":
      allowProperties(footprint, `${change.prototypeType}/${change.prototypeName}`, [change.property]);
      return;
    case "recipe_ingredient":
      allowProperties(footprint, `recipe/${change.recipeName}`, ["ingredients"]);
      return;
    case "recipe_crafting_time":
      allowProperties(footprint, `recipe/${change.recipeName}`, ["energy_required"]);
      return;
    case "recipe_result":
      allowProperties(footprint, `recipe/${change.recipeName}`, ["results"]);
      return;
    case "item_stack_size":
      allowProperties(footprint, `item/${change.itemName}`, ["stack_size"]);
      return;
    case "technology_cost":
      allowProperties(footprint, `technology/${change.technologyName}`, ["unit"]);
      return;
    case "technology_prerequisite":
      allowProperties(footprint, `technology/${change.technologyName}`, ["prerequisites"]);
      return;
    case "new_item":
      footprint.set(`item/${change.name}`, "added");
      footprint.set(`recipe/${change.name}`, "added");
      allowUnlock(footprint, change.name, change.unlock);
      return;
    case "new_recipe":
      footprint.set(`recipe/${change.name}`, "added");
      allowUnlock(footprint, change.name, change.unlock);
      return;
    case "new_machine":
      footprint.set(`${change.machineType}/${change.name}`, "added");
      footprint.set(`item/${change.name}`, "added");
      footprint.set(`recipe/${change.name}`, "added");
      allowUnlock(footprint, change.name, change.unlock);
      return;
  }
}

/**
 * The `data.raw` footprint the application-owned generator may produce for a ModSpec.
 * Anything a candidate changes outside it is not part of the accepted request.
 */
export function modSpecFootprint(spec: ModSpec): PrototypeFootprint {
  const footprint = new Map<string, PrototypeAllowance>();
  for (const change of spec.changes) addChangeFootprint(footprint, change);
  return footprint;
}

/** Changes in `candidate` relative to the base game that `footprint` does not allow. */
export function findFootprintViolations(
  baseline: DataRawFingerprint,
  candidate: DataRawFingerprint,
  footprint: PrototypeFootprint,
): string[] {
  const violations: string[] = [];
  for (const key of new Set([...baseline.keys(), ...candidate.keys()])) {
    const before = baseline.get(key);
    const after = candidate.get(key);
    if (before !== undefined && after !== undefined && before.digest === after.digest) continue;

    const allowance = footprint.get(key);
    if (allowance === "added") {
      if (before === undefined) continue;
      violations.push(after === undefined ? `${key} (removed)` : `${key} (replaced existing prototype)`);
      continue;
    }
    if (before === undefined) {
      violations.push(`${key} (added)`);
      continue;
    }
    if (after === undefined) {
      violations.push(`${key} (removed)`);
      continue;
    }
    for (const property of changedProperties(before, after)) {
      if (allowance === undefined || !allowance.has(property)) violations.push(`${key}.${property}`);
    }
  }
  return violations.sort();
}

export function summarizeAddresses(addresses: readonly string[]): string {
  const shown = addresses.slice(0, MAX_REPORTED_ADDRESSES).join(", ");
  return addresses.length > MAX_REPORTED_ADDRESSES
    ? `${shown} (+${addresses.length - MAX_REPORTED_ADDRESSES} more)`
    : shown;
}
