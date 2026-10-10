import {
  GeneratedFileManifestSchema,
  ModSpecSchema,
  type GeneratedFileManifest,
  type ModSpec,
  type PrototypePropertyAssertion,
  type PrototypePropertyChange,
  type ScalarOperation,
} from "@project/domain";

import {
  assertSupportedPrototypeProperty,
  getSupportedPrototypeProperty,
} from "./supported.js";

const GENERATED_VERSION = "0.1.0";
const GENERATED_AUTHOR = "Generated mod";
const SEMANTIC_MARKER = "__PROJECT_SEMANTIC_ASSERTION__";
const safeLuaIdentifier = /^[A-Za-z0-9_-]+$/;
const safeLuaProperty = /^[A-Za-z_][A-Za-z0-9_]*$/;
const controlCharacter = /[\u0000-\u001f\u007f]/;

export interface GeneratedFactorioMod {
  readonly name: string;
  readonly version: string;
  readonly directoryName: string;
  readonly manifest: GeneratedFileManifest;
  readonly semanticAssertionLua: string;
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

function expectedValue(operation: ScalarOperation, baseValue: number): number {
  const value = operation.type === "set" ? operation.value : baseValue * operation.factor;
  if (!Number.isFinite(value)) {
    throw new Error("Semantic expectation must be finite");
  }
  return value;
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

function renderAssertion(assertion: PrototypePropertyAssertion): string {
  const supported = getSupportedPrototypeProperty({
    type: "prototype_property",
    prototypeType: assertion.prototypeType,
    prototypeName: assertion.prototypeName,
    property: assertion.property,
    operation: assertion.expectation,
  });
  const expected = expectedValue(assertion.expectation, supported.baseValue);
  const type = quoteLuaIdentifier(assertion.prototypeType, "identifier");
  const name = quoteLuaIdentifier(assertion.prototypeName, "identifier");
  const property = quoteLuaIdentifier(assertion.property, "property");
  const address = `${assertion.prototypeType}.${assertion.prototypeName}.${assertion.property}`;
  const markerPrefix = quoteLuaText(`${SEMANTIC_MARKER}|${address}|expected=${expected}|actual=`);

  return [
    "do",
    `  local prototype = data.raw[${type}] and data.raw[${type}][${name}]`,
    `  local actual = prototype and prototype[${property}] or nil`,
    `  local expected = ${luaNumber(expected)}`,
    "  local tolerance = 1e-9 * math.max(1, math.abs(expected))",
    "  if type(actual) ~= \"number\" or math.abs(actual - expected) > tolerance then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
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
  const infoJson = `${JSON.stringify(info, null, 2)}\n`;
  const dataLua = `${spec.changes.map(renderChange).join("\n\n")}\n`;
  const manifest = GeneratedFileManifestSchema.parse({
    files: [
      { path: "info.json", content: infoJson, role: "metadata" },
      { path: "data.lua", content: dataLua, role: "data_stage" },
    ],
  });

  return {
    name: spec.slug,
    version: GENERATED_VERSION,
    directoryName: `${spec.slug}_${GENERATED_VERSION}`,
    manifest,
    semanticAssertionLua: `${spec.assertions.map(renderAssertion).join("\n\n")}\n`,
  };
}
