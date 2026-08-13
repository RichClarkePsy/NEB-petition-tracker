const fs = require("fs");
const path = require("path");

const PETITION_ID = "767687";
const PETITION_JSON_URL = `https://petition.parliament.uk/petitions/${PETITION_ID}.json`;
const siteDir = path.resolve(__dirname, "..");
const historyPath = path.join(siteDir, "history.json");

function readHistory() {
  if (!fs.existsSync(historyPath)) return [];
  return JSON.parse(fs.readFileSync(historyPath, "utf8").replace(/^\uFEFF/, ""));
}

function writeHistory(history) {
  fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
}

function normalizeHistory(history) {
  const byTimestamp = new Map();

  for (const item of history) {
    const signatures = Number(item.signatures);
    const observedAt = item.observed_at || item.date || item.timestamp;
    if (!observedAt || !Number.isFinite(signatures)) continue;

    const point = {
      observed_at: new Date(observedAt).toISOString(),
      signatures,
      source_updated_at: item.source_updated_at ? new Date(item.source_updated_at).toISOString() : null,
      source: item.source || "history"
    };

    const existing = byTimestamp.get(point.observed_at);
    if (!existing || point.signatures >= existing.signatures) {
      byTimestamp.set(point.observed_at, point);
    }
  }

  return Array.from(byTimestamp.values()).sort((a, b) => {
    return new Date(a.observed_at) - new Date(b.observed_at);
  });
}

async function fetchCurrentPoint() {
  const response = await fetch(PETITION_JSON_URL, {
    headers: {
      "accept": "application/json",
      "user-agent": "petition-history-updater"
    }
  });

  if (!response.ok) {
    throw new Error(`Petition API returned HTTP ${response.status}`);
  }

  const json = await response.json();
  const attrs = json && json.data && json.data.attributes ? json.data.attributes : {};
  const signatures = Number(attrs.signature_count);

  if (!Number.isFinite(signatures)) {
    throw new Error("Petition API response did not include a valid signature_count");
  }

  return {
    observed_at: new Date().toISOString(),
    signatures,
    source_updated_at: attrs.updated_at ? new Date(attrs.updated_at).toISOString() : null,
    source: "github-action"
  };
}

function shouldAppend(history, point) {
  const last = history[history.length - 1];
  if (!last) return true;
  return last.signatures !== point.signatures || last.source_updated_at !== point.source_updated_at;
}

(async () => {
  const history = normalizeHistory(readHistory());
  const point = await fetchCurrentPoint();

  if (shouldAppend(history, point)) {
    history.push(point);
    writeHistory(normalizeHistory(history));
    console.log(`Added ${point.signatures} signatures at ${point.observed_at}`);
  } else {
    console.log(`No history change: still ${point.signatures} signatures`);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
