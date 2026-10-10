import type { PrototypePropertyChange } from "@project/domain";

export interface SupportedPrototypeProperty {
  readonly prototypeType: string;
  readonly prototypeName: string;
  readonly property: string;
  readonly baseValue: number;
}

const supportedPrototypeProperties = new Map<string, SupportedPrototypeProperty>([
  [
    "furnace\u0000stone-furnace\u0000crafting_speed",
    {
      prototypeType: "furnace",
      prototypeName: "stone-furnace",
      property: "crafting_speed",
      baseValue: 1,
    },
  ],
  [
    "furnace\u0000steel-furnace\u0000crafting_speed",
    {
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      baseValue: 2,
    },
  ],
  [
    "furnace\u0000electric-furnace\u0000crafting_speed",
    {
      prototypeType: "furnace",
      prototypeName: "electric-furnace",
      property: "crafting_speed",
      baseValue: 2,
    },
  ],
]);

function supportKey(change: PrototypePropertyChange) {
  return `${change.prototypeType}\u0000${change.prototypeName}\u0000${change.property}`;
}

export function getSupportedPrototypeProperty(
  change: PrototypePropertyChange,
): SupportedPrototypeProperty {
  const supported = supportedPrototypeProperties.get(supportKey(change));
  if (!supported) {
    throw new Error(
      `Unsupported prototype property: ${change.prototypeType}.${change.prototypeName}.${change.property}`,
    );
  }
  return supported;
}

export function assertSupportedPrototypeProperty(
  change: PrototypePropertyChange,
): void {
  getSupportedPrototypeProperty(change);
}
