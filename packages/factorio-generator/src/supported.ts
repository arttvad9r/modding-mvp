import type { PrototypePropertyChange } from "@project/domain";

const supportedPrototypeProperties = new Set(["furnace\u0000crafting_speed"]);

function supportKey(change: PrototypePropertyChange) {
  return `${change.prototypeType}\u0000${change.property}`;
}

export function assertSupportedPrototypeProperty(
  change: PrototypePropertyChange,
): void {
  if (!supportedPrototypeProperties.has(supportKey(change))) {
    throw new Error(
      `Unsupported prototype property: ${change.prototypeType}.${change.property}`,
    );
  }
}
