const fs = require('fs');
const path = require('path');

/**
 * Loads JSON data from disk. Returns an empty object when the file
 * does not exist or cannot be read.
 */
function load(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // Missing file is fine on the first run.
    if (err.code !== 'ENOENT') {
      console.error('Unable to read storage file:', err.message);
    }
    return {};
  }
}

/**
 * Writes JSON data to disk, creating folders when needed.
 */
function save(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Unable to save storage file:', err.message);
  }
}

module.exports = { load, save };
