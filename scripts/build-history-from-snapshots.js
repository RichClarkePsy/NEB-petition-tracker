const fs = require("fs");
const path = require("path");

const siteDir = path.resolve(__dirname, "..");
const snapshotsDir = path.join(siteDir, "Old snapshots");
const outputPath = path.join(siteDir, "history.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function toHistoryPoint(filePath) {
  const json = readJson(filePath);
  const attrs = json && json.data && json.data.attributes ? json.data.attributes : {};
  const signatures = Number(attrs.signature_count);
  const sourceUpdatedAt = attrs.updated_at || null;

  if (!Number.isFinite(signatures) || !sourceUpdatedAt) {
    return null;
  }

  return {
    observed_at: new Date(sourceUpdatedAt).toISOString(),
    signatures,
    source_updated_at: new Date(sourceUpdatedAt).toISOString(),
    source: "snapshot"
  };
}

function mergeByTimestamp(points) {
  const byTimestamp = new Map();

  for (const point of points) {
    const existing = byTimestamp.get(point.observed_at);
    if (!existing || point.signatures >= existing.signatures) {
      byTimestamp.set(point.observed_at, point);
    }
  }

  return Array.from(byTimestamp.values()).sort((a, b) => {
    return new Date(a.observed_at) - new Date(b.observed_at);
  });
}

if (!fs.existsSync(snapshotsDir)) {
  throw new Error(`Snapshot folder not found: ${snapshotsDir}`);
}

const points = fs.readdirSync(snapshotsDir)
  .filter(file => file.toLowerCase().endsWith(".json"))
  .map(file => toHistoryPoint(path.join(snapshotsDir, file)))
  .filter(Boolean);

const history = mergeByTimestamp(points);
fs.writeFileSync(outputPath, `${JSON.stringify(history, null, 2)}\n`);

console.log(`Wrote ${history.length} history points to ${outputPath}`);
