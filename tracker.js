const path = require('path');
const { fetchNeighborhoodDetails } = require('./uplandApi');
const storage = require('./storage');

const DATA_FILE = path.join(__dirname, 'data.json');
const NEIGHBORHOODS = [
  { id: 1738, key: 'flushing', label: 'Flushing' },
  { id: 1755, key: 'kew', label: 'Kew Gardens Hills' },
  { id: 1400, key: 'chatsworth', label: 'Chatsworth' },
  { id: 1252, key: 'milneburg', label: 'Milneburg' },
  { id: 1496, key: 'winnetka', label: 'Winnetka' },
  { id: 1748, key: 'howard', label: 'Howard Beach' },
  { id: 2675, key: 'ardeatino', label: 'Ardeatino' },
  { id: 2460, key: 'aup', label: 'American University Park' },
  { id: 1055, key: 'waukomis', label: 'Lake Waukomis' },
  { id: 1411, key: 'elsereno', label: 'El Sereno' }
];

/**
 * Runs one daily tracking cycle.
 * Saves to disk and returns a formatted report string.
 */
async function runDailyCheck() {
  const previous = storage.load(DATA_FILE);
  const current = {};

  for (const n of NEIGHBORHOODS) {
    try {
      const details = await fetchNeighborhoodDetails(n.id);
      current[n.key] = Number(details.residents);
    } catch (err) {
      console.error(`Resident fetch failed for ${n.label}:`, err.message);
      current[n.key] = 'N/A';
    }
  }

  current.lastUpdated = new Date().toISOString();
  storage.save(DATA_FILE, current);

  return buildMessage(previous, current);
}

function buildMessage(previous, current) {
  const hasPreviousData =
    previous && typeof previous === 'object' && Object.keys(previous).length > 0;

  const lines = ['📊 Daily Upland Report:'];

  for (const n of NEIGHBORHOODS) {
    const count = current[n.key];
    if (hasPreviousData && typeof previous[n.key] === 'number' && typeof count === 'number') {
      const delta = count - previous[n.key];
      lines.push(`🏙️ ${n.label}: ${count} (${formatDelta(delta)})`);
    } else {
      lines.push(`🏙️ ${n.label}: ${count}`);
    }
  }

  return lines.join('\n');
}

function formatDelta(delta) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '+0';
}

module.exports = { runDailyCheck, DATA_FILE, NEIGHBORHOODS };
