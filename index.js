require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { runDailyCheck, DATA_FILE, NEIGHBORHOODS } = require('./tracker');
const storage = require('./storage');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const REPORT_TIME = process.env.REPORT_TIME || '0 9 * * *';
const TIMEZONE = 'America/Bogota';

if (!DISCORD_TOKEN || !CHANNEL_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CHANNEL_ID in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let channel = null;

client.once(Events.ClientReady, async () => {
  console.log('Discord client ready. Logged in as', client.user.tag);

  try {
    channel = await client.channels.fetch(CHANNEL_ID);
    await channel.send('Tracking Bot is now live! 🚀');
  } catch (err) {
    console.error('Discord error:', err.message);
    return;
  }

  await checkData('Startup run');

  cron.schedule(
    REPORT_TIME,
    async () => {
      console.log('Cron run triggered at', new Date().toISOString());
      await checkData('Cron run');
    },
    { timezone: TIMEZONE }
  );
});

async function checkData(label) {
  return runAndReport(label || 'Manual run');
}

async function runAndReport(label) {
  console.log(`${label} starting...`);

  if (!channel) {
    console.error('Discord channel is not ready yet.');
    return;
  }

  try {
    // Residents
    const residentReport = await runDailyCheck();
    const residents = storage.load(DATA_FILE);

    // Constructions
    const constructionData = await safeGetConstructionData();

    const message = buildCombinedMessage(residentReport, residents, constructionData);

    try {
      await channel.send(message);
    } catch (sendErr) {
      console.error('Error sending message:', sendErr.message);
    }
  } catch (err) {
    console.error('General error:', err.message);
    try {
      await channel.send(`Monitoring error: ${err.message}`);
    } catch (sendErr) {
      console.error('Error sending error message:', sendErr.message);
    }
  }
}

async function safeGetConstructionData() {
  try {
    return await getConstructionData();
  } catch (err) {
    console.error('Construction data fetch failed:', err.message);
    const empty = {};
    for (const n of NEIGHBORHOODS) {
      empty[n.key] = {
        total: 'N/A',
        types: {
          small: 'N/A',
          large: 'N/A',
          complex: 'N/A',
          tower: 'N/A'
        }
      };
    }
    return empty;
  }
}

async function getConstructionData() {
  console.log('Fetching construction data...');
  const endpoints = {
    flushing: 'https://uplytics.org/api/get_active_offices.php?status=building&node=flushing',
    kew: 'https://uplytics.org/api/get_active_offices.php?status=building&node=kgh',
    chatsworth: 'https://uplytics.org/api/get_active_offices.php?status=building&node=cw',
    milneburg: 'https://uplytics.org/api/get_active_offices.php?status=building&node=mb',
    winnetka: 'https://uplytics.org/api/get_active_offices.php?status=building&node=win',
    howard: 'https://uplytics.org/api/get_active_offices.php?status=building&node=hb',
    ardeatino:
      'https://uplytics.org/api/get_active_offices.php?status=building&node=ardeatino&limit=20&offset=0',
    aup:
      'https://uplytics.org/api/get_active_offices.php?status=building&node=aup&limit=20&offset=0',
    waukomis:
      'https://uplytics.org/api/get_active_offices.php?status=building&node=waukomis&limit=20&offset=0',
    elsereno:
      'https://uplytics.org/api/get_active_offices.php?status=building&node=elsereno&limit=20&offset=0'
  };

  const groupedByNeighborhood = {};

  for (const [key, url] of Object.entries(endpoints)) {
    try {
      const res = await axios.get(url, {
        timeout: 10_000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json'
        }
      });
      const data = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      if (!Array.isArray(data)) {
        console.error(`Unexpected construction payload for ${key}:`, res.data);
      }
      groupedByNeighborhood[key] = groupByBuildingName(data);
    } catch (err) {
      console.error(`Construction fetch failed for ${key}:`, err.message);
      groupedByNeighborhood[key] = 'N/A';
    }
  }

  console.log('Construction data loaded');
  return groupedByNeighborhood;
}

function groupByBuildingName(list) {
  const grouped = {};
  for (const item of list) {
    const name =
      item?.building_name ||
      item?.structure ||
      item?.office_type ||
      item?.type ||
      'Unknown';
    grouped[name] = (grouped[name] || 0) + 1;
  }
  return grouped;
}

function formatConstruction(grouped) {
  if (!grouped || grouped === 'N/A') return '🏗 Constructions: N/A';
  const entries = Object.entries(grouped);
  if (entries.length === 0) return '🏗 Constructions: 0';
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const lines = entries.map(([name, count]) => `• ${name}: ${count}`);
  return [`🏗 Total: ${total}`, ...lines].join('\n');
}

function buildCombinedMessage(residentReport, residents, construction) {
  const header = '📊 Upland Daily Report:';
  const reportLines = residentReport.split('\n').map((l) => l.trim());

  const residentLine = (key, label) => {
    const detail = extractResidentLine(reportLines, key) ?? fallbackResident(residents, key);
    return `${label}\n👥 Residents: ${detail}`;
  };

  const constructionLines = (key) => formatConstruction(construction[key]);

  const blocks = [
    `${residentLine('flushing', '🏙 Flushing:')}`,
    constructionLines('flushing'),
    '',
    `${residentLine('kew', '🏡 Kew Gardens Hills:')}`,
    constructionLines('kew'),
    '',
    `${residentLine('chatsworth', '🌆 Chatsworth:')}`,
    constructionLines('chatsworth'),
    '',
    `${residentLine('milneburg', '🌆 Milneburg:')}`,
    constructionLines('milneburg'),
    '',
    `${residentLine('winnetka', '🌆 Winnetka:')}`,
    constructionLines('winnetka'),
    '',
    `${residentLine('howard', '🌆 Howard Beach:')}`,
    constructionLines('howard'),
    '',
    `${residentLine('ardeatino', '🌆 Ardeatino:')}`,
    constructionLines('ardeatino'),
    '',
    `${residentLine('aup', '🌆 American University Park:')}`,
    constructionLines('aup'),
    '',
    `${residentLine('waukomis', '🌆 Lake Waukomis:')}`,
    constructionLines('waukomis'),
    '',
    `${residentLine('elsereno', '🌆 El Sereno:')}`,
    constructionLines('elsereno')
  ];

  const analytics = buildAnalytics(construction, residents);

  return [header, '', ...blocks, '', ...analytics].join('\n');
}

function extractResidentLine(lines, key) {
  const match = lines.find((l) => l.toLowerCase().includes(key));
  if (!match) return null;
  const parts = match.split(':');
  const rest = parts.slice(1).join(':').trim();
  return rest || match;
}

function fallbackResident(residents, key) {
  const val = residents[key];
  return typeof val === 'number' ? `${val}` : 'N/A';
}

function buildAnalytics(construction, residents) {
  const totals = Object.values(construction)
    .map((c) => {
      if (!c || c === 'N/A') return 0;
      return Object.values(c).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
    })
    .reduce((a, b) => a + b, 0);

  let mostActive = { key: null, total: -1 };
  for (const [key, data] of Object.entries(construction)) {
    const t = typeof data?.total === 'number' ? data.total : 0;
    if (t > mostActive.total) {
      mostActive = { key, total: t };
    }
  }

  const percentFor = (key) => {
    const t = construction[key] && construction[key] !== 'N/A'
      ? Object.values(construction[key]).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0)
      : 0;
    if (totals === 0) return '0%';
    return `${((t / totals) * 100).toFixed(1)}%`;
  };

  const labelFor = (key) => {
    const map = {
      flushing: 'Flushing',
      kew: 'Kew Gardens Hills',
      chatsworth: 'Chatsworth',
      milneburg: 'Milneburg',
      winnetka: 'Winnetka',
      howard: 'Howard Beach',
      ardeatino: 'Ardeatino',
      aup: 'American University Park',
      waukomis: 'Lake Waukomis',
      elsereno: 'El Sereno'
    };
    return map[key] || key;
  };

  const analyticsLines = [];
  if (mostActive.key) {
    analyticsLines.push(
      `🔥 MOST ACTIVE NODE: ${labelFor(mostActive.key)} (${percentFor(mostActive.key)})`
    );
  } else {
    analyticsLines.push('🔥 MOST ACTIVE NODE: N/A');
  }

  // Dominating city check
  let topResidents = { key: null, val: -1 };
  for (const [key, val] of Object.entries(residents)) {
    if (typeof val === 'number' && val > topResidents.val) {
      topResidents = { key, val };
    }
  }

  if (mostActive.key && topResidents.key && mostActive.key === topResidents.key) {
    analyticsLines.push(
      `👑 DOMINATING CITY: ${labelFor(mostActive.key)} is leading in both residents and construction!`
    );
  }

  return analyticsLines;
}

client
  .login(DISCORD_TOKEN)
  .catch((err) => console.error('Discord login failed:', err.message));
