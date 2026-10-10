import {
  ModSpecSchema,
  type ModSpec,
  type PrototypePropertyChange,
  type ScalarOperation,
} from "@project/domain";

import { assertSupportedPrototypeProperty } from "./supported.js";

const GENERATED_VERSION = "0.1.0";
const GENERATED_AUTHOR = "Generated mod";
const safeLuaIdentifier = /^[A-Za-z0-9_-]+$/;
const safeLuaProperty = /^[A-Za-z_][A-Za-z0-9_]*$/;
const controlCharacter = /[\u0000-\u001f\u007f]/;

export interface GeneratedFactorioMod {
  readonly name: string;
  readonly version: string;
  readonly directoryName: string;
  readonly infoJson: string;
  readonly dataLua: string;
}

function quoteLuaText(value: string): string {
  if (controlCharacter.test(value)) {
    throw new Error("Lua strings must not contain control characters");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function quoteLuaIdentifier(value: string, kind: "identifier" | "property"): string {
  const pattern = kind === "identifier" ? safeLuaIdentifier : safeLuaProperty;
  if (!pattern.test(value)) {
    throw new Error(`Unsafe Lua ${kind}: ${value}`);
  }
  return quoteLuaText(value);
}

function luaNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot render a non-finite Lua number");
  }
  return Object.is(value, -0) ? "0" : String(value);
}

function renderOperation(operation: ScalarOperation, propertyExpression: string) {
  return operation.type === "set"
    ? luaNumber(operation.value)
    : `${propertyExpression} * ${luaNumber(operation.factor)}`;
}

function renderChange(change: PrototypePropertyChange): string {
  assertSupportedPrototypeProperty(change);

  const type = quoteLuaIdentifier(change.prototypeType, "identifier");
  const name = quoteLuaIdentifier(change.prototypeName, "identifier");
  const property = quoteLuaIdentifier(change.property, "property");
  const propertyExpression = `prototype[${property}]`;
  const missingMessage = quoteLuaText(
    `Missing prototype ${change.prototypeType}.${change.prototypeName}`,
  );
  const nonNumericMessage = quoteLuaText(
    `Expected numeric property ${change.prototypeType}.${change.prototypeName}.${change.property}`,
  );

  return [
    "do",
    `  local prototype = data.raw[${type}] and data.raw[${type}][${name}]`,
    `  assert(prototype, ${missingMessage})`,
    `  assert(type(${propertyExpression}) == \"number\", ${nonNumericMessage})`,
    `  ${propertyExpression} = ${renderOperation(change.operation, propertyExpression)}`,
    "end",
  ].join("\n");
}

export function generateFactorioMod(input: ModSpec): GeneratedFactorioMod {
  const spec = ModSpecSchema.parse(input);
  for (const change of spec.changes) {
    assertSupportedPrototypeProperty(change);
  }

  const info = {
    name: spec.slug,
    version: GENERATED_VERSION,
    title: spec.title,
    author: GENERATED_AUTHOR,
    factorio_version: spec.target.versionLine,
    dependencies: [`base >= ${spec.target.versionLine}`],
  };

  return {
    name: spec.slug,
    version: GENERATED_VERSION,
    directoryName: `${spec.slug}_${GENERATED_VERSION}`,
    infoJson: `${JSON.stringify(info, null, 2)}\n`,
    dataLua: `${spec.changes.map(renderChange).join("\n\n")}\n`,
  };
}
