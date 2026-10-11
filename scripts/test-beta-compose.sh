#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

config=$(docker compose \
  --env-file infra/beta.env.example \
  -f infra/compose.beta.yaml \
  config --format json)

CONFIG_JSON="$config" node <<'NODE'
const config = JSON.parse(process.env.CONFIG_JSON);

function fail(message) {
  console.error(`beta compose invariant failed: ${message}`);
  process.exit(1);
}

function onlyPort(serviceName, hostIp, target) {
  const ports = config.services?.[serviceName]?.ports ?? [];
  if (ports.length !== 1) fail(`${serviceName} must expose exactly one host port`);
  const port = ports[0];
  if (port.host_ip !== hostIp || port.target !== target) {
    fail(`${serviceName} must publish ${hostIp}:${target} only`);
  }
}

const postgresVolumes = config.services?.postgres?.volumes ?? [];
const postgresData = postgresVolumes.find((volume) => volume.source === "postgres18_data");
if (!postgresData || postgresData.target !== "/var/lib/postgresql") {
  fail("PostgreSQL 18 data volume must mount at /var/lib/postgresql");
}
if (postgresVolumes.some((volume) => volume.target === "/var/lib/postgresql/data")) {
  fail("legacy PostgreSQL /var/lib/postgresql/data mount must not be used");
}

onlyPort("web", "127.0.0.1", 3000);
onlyPort("object-storage", "127.0.0.1", 8333);

const subnet = config.networks?.default?.ipam?.config?.[0]?.subnet;
if (subnet !== "172.30.0.0/24") {
  fail(`default network subnet must be 172.30.0.0/24, got ${subnet ?? "missing"}`);
}

if (config.services?.worker?.environment?.WORKER_CONCURRENCY !== "1") {
  fail("initial beta worker concurrency must remain 1");
}

console.log(JSON.stringify({ status: "OK", betaCompose: true }));
NODE
