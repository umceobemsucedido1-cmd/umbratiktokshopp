const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Detecta automaticamente onde estão os arquivos estáticos
const fs = require('fs');
const publicDir = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(express.static(publicDir));

// ═══════════════════════════════════════════════
//  API KEYS — TikTok Scraper + TikTok API
//  Keys ficam seguras no servidor (nunca expostas)
// ═══════════════════════════════════════════════
const SCRAPER_KEYS = [
  "3a0fadde0bmsh3bdc24f7b6b54a8p102809jsnc72915f2dfe3",
  "76c0b8393bmshb33402a764932c6p1ce435jsn7b93b25736fe",
  "fe19f98d5amsh6f86a8298d1a5cfp127680jsn351cd3b79817",
  "d70b30e481msh7c765f83c46e76ep1bb4fcjsn47bca36f7068",
  "a9d81e2ec2msh22954d06397d760p19e80fjsn86484cb77421",
  "85466c35f7mshabef6384e4e762fp16f10bjsnfba494772ea6",
  "56f9db7b90msh569eae34c8423f1p1690dajsn1c05ee9a242c",
  "9c212f6cf1msh6914f929abe839dp1a34f3jsnb4a23bf18742",
  "4c1806ac4emsh392bb25fb4f9ea1p133f0djsned629ed0a0d0",
  "a9f40cd55fmsh2b14b1e8831dbf6p1bf01ajsnce33d14e2a2a"
];

const TIKTOK_API_KEYS = [
  "3a0fadde0bmsh3bdc24f7b6b54a8p102809jsnc72915f2dfe3",
  "76c0b8393bmshb33402a764932c6p1ce435jsn7b93b25736fe",
  "a9f40cd55fmsh2b14b1e8831dbf6p1bf01ajsnce33d14e2a2a",
  "56f9db7b90msh569eae34c8423f1p1690dajsn1c05ee9a242c",
  "a9d81e2ec2msh22954d06397d760p19e80fjsn86484cb77421",
  "85466c35f7mshabef6384e4e762fp16f10bjsnfba494772ea6",
  "4c1806ac4emsh392bb25fb4f9ea1p133f0djsned629ed0a0d0",
  "9c212f6cf1msh6914f929abe839dp1a34f3jsnb4a23bf18742",
  "fe19f98d5amsh6f86a8298d1a5cfp127680jsn351cd3b79817",
  "d70b30e481msh7c765f83c46e76ep1bb4fcjsn47bca36f7068"
];

const SCRAPER_HOST  = "tiktok-scraper7.p.rapidapi.com";
const TIKTOKAPI_HOST = "tiktok-api23.p.rapidapi.com";

// Key index state (per API)
let scraperIdx = 0;
let tiktokIdx  = 0;

// Track dead keys
const scraperDead  = new Set();
const tiktokDead   = new Set();

// Request counters
let scraperReqs = 0;
let tiktokReqs  = 0;

// ─────────────────────────────────────────────
//  Key rotation helpers
// ─────────────────────────────────────────────
function getScraperKey() {
  return SCRAPER_KEYS[scraperIdx];
}
function getTiktokKey() {
  return TIKTOK_API_KEYS[tiktokIdx];
}

function rotateScraperKey(kill = false) {
  if (kill) scraperDead.add(scraperIdx);
  let tries = 0;
  do {
    scraperIdx = (scraperIdx + 1) % SCRAPER_KEYS.length;
    tries++;
  } while (scraperDead.has(scraperIdx) && tries < SCRAPER_KEYS.length);
  console.log(`[SCRAPER] Usando key ${scraperIdx + 1}/${SCRAPER_KEYS.length}`);
}

function rotateTiktokKey(kill = false) {
  if (kill) tiktokDead.add(tiktokIdx);
  let tries = 0;
  do {
    tiktokIdx = (tiktokIdx + 1) % TIKTOK_API_KEYS.length;
    tries++;
  } while (tiktokDead.has(tiktokIdx) && tries < TIKTOK_API_KEYS.length);
  console.log(`[TIKTOK API] Usando key ${tiktokIdx + 1}/${TIKTOK_API_KEYS.length}`);
}

// ─────────────────────────────────────────────
//  Generic proxy fetch with key rotation
// ─────────────────────────────────────────────
async function proxyFetch(host, path, params, keys, getKey, rotateKey, counter, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    const url = new URL(`https://${host}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });

    try {
      const res = await fetch(url.toString(), {
        headers: {
          'X-RapidAPI-Key': getKey(),
          'X-RapidAPI-Host': host
        }
      });

      counter.count = (counter.count || 0) + 1;

      if (res.status === 429 || res.status === 403) {
        console.warn(`[${host}] Key bloqueada (${res.status}), rotacionando...`);
        rotateKey(true);
        attempt++;
        continue;
      }

      if (!res.ok) {
        console.warn(`[${host}] HTTP ${res.status}, tentando próxima key...`);
        rotateKey(false);
        attempt++;
        continue;
      }

      const data = await res.json();
      rotateKey(false); // rotação suave após sucesso (distribui carga)
      return { ok: true, data };

    } catch (err) {
      console.error(`[${host}] Erro de rede:`, err.message);
      rotateKey(false);
      attempt++;
    }
  }
  return { ok: false, error: 'Todas as tentativas falharam' };
}

const scraperCounter = { count: 0 };
const tiktokCounter  = { count: 0 };

// ─────────────────────────────────────────────
//  SIMPLE CACHE — 15 min TTL
// ─────────────────────────────────────────────
const CACHE = new Map();
const TTL = 15 * 60 * 1000; // 15 minutes

function getCachedData(key) {
  const cached = CACHE.get(key);
  if (cached && (Date.now() - cached.ts < TTL)) {
    console.log(`[CACHE] Hit: ${key}`);
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  if (!data || !data.ok) return;
  CACHE.set(key, { data, ts: Date.now() });
}

// Clean old cache every 30 mins
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of CACHE.entries()) {
    if (now - val.ts > TTL) CACHE.delete(key);
  }
}, 30 * 60 * 1000);

// ─────────────────────────────────────────────
//  ROUTES — TikTok Scraper API
// ─────────────────────────────────────────────

// Trending feed (principal — carregado automaticamente)
app.get('/api/trending', async (req, res) => {
  const { region = 'BR', count = 20, cursor = 0 } = req.query;
  const cacheKey = `trending:${region}:${count}:${cursor}`;
  
  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  const result = await proxyFetch(
    SCRAPER_HOST, '/feed/search',
    { keywords: 'TikTokShop', count, cursor, region, publish_time: 0, sort_type: 0 },
    SCRAPER_KEYS, getScraperKey, rotateScraperKey, scraperCounter
  );
  
  setCachedData(cacheKey, result);
  res.json(result);
});

// Search videos (Scraper)
app.get('/api/search', async (req, res) => {
  const { keywords = 'TikTokShop', count = 20, cursor = 0, region = 'BR' } = req.query;
  const result = await proxyFetch(
    SCRAPER_HOST, '/feed/search',
    { keywords, count, cursor, region, publish_time: 0, sort_type: 0 },
    SCRAPER_KEYS, getScraperKey, rotateScraperKey, scraperCounter
  );
  res.json(result);
});

// User posts
app.get('/api/user/posts', async (req, res) => {
  const { username, count = 20, cursor = 0 } = req.query;
  const result = await proxyFetch(
    SCRAPER_HOST, '/user/posts',
    { unique_id: username, count, cursor },
    SCRAPER_KEYS, getScraperKey, rotateScraperKey, scraperCounter
  );
  res.json(result);
});

// User info
app.get('/api/user/info', async (req, res) => {
  const { username } = req.query;
  const result = await proxyFetch(
    SCRAPER_HOST, '/user/info',
    { unique_id: username },
    SCRAPER_KEYS, getScraperKey, rotateScraperKey, scraperCounter
  );
  res.json(result);
});

// Post detail
app.get('/api/post', async (req, res) => {
  const { url } = req.query;
  const result = await proxyFetch(
    SCRAPER_HOST, '/post/detail',
    { url },
    SCRAPER_KEYS, getScraperKey, rotateScraperKey, scraperCounter
  );
  res.json(result);
});

// ─────────────────────────────────────────────
//  ROUTES — TikTok API (apibox / api23)
// ─────────────────────────────────────────────

// Trending posts (TikTok API)
app.get('/api/tiktok/trending', async (req, res) => {
  const { region = 'BR', count = 20, cursor = 0 } = req.query;
  const cacheKey = `tiktok_trending:${region}:${count}:${cursor}`;
  
  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/trending/feed',
    { region, count, cursor },
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );

  setCachedData(cacheKey, result);
  res.json(result);
});

// Explore posts
app.get('/api/tiktok/explore', async (req, res) => {
  const { region = 'BR', count = 20, cursor = 0 } = req.query;
  const cacheKey = `tiktok_explore:${region}:${count}:${cursor}`;

  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/post/explore',
    { region, count, cursor },
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );

  setCachedData(cacheKey, result);
  res.json(result);
});

// Trending video (Ads)
app.get('/api/tiktok/ads/trending', async (req, res) => {
  const { count = 20, cursor = 0 } = req.query;
  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/ads/trending/video',
    { count, cursor },
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );
  res.json(result);
});

// Get trending hashtag
app.get('/api/tiktok/trending/hashtag', async (req, res) => {
  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/ads/trending/hashtag',
    {},
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );
  res.json(result);
});

// Get trending creator
app.get('/api/tiktok/trending/creator', async (req, res) => {
  const { region = 'BR' } = req.query;
  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/ads/trending/creator',
    { region },
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );
  res.json(result);
});

// Search video (TikTok API)
app.get('/api/tiktok/search', async (req, res) => {
  const { keywords, count = 20, cursor = 0, region = 'BR' } = req.query;
  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/search/video',
    { keywords, count, cursor, region, sort_type: 0, publish_time: 0 },
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );
  res.json(result);
});

// Get top products
app.get('/api/tiktok/products', async (req, res) => {
  const { region = 'BR', count = 20 } = req.query;
  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/ads/top/product',
    { region, count },
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );
  res.json(result);
});

// Product info (Shop)
app.get('/api/tiktok/shop/product', async (req, res) => {
  const { product_id } = req.query;
  const result = await proxyFetch(
    TIKTOKAPI_HOST, '/api/shop/product',
    { product_id },
    TIKTOK_API_KEYS, getTiktokKey, rotateTiktokKey, tiktokCounter
  );
  res.json(result);
});

// ─────────────────────────────────────────────
//  STATUS endpoint (health check + key status)
// ─────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    scraper: {
      currentKey: scraperIdx + 1,
      totalKeys: SCRAPER_KEYS.length,
      deadKeys: [...scraperDead],
      requests: scraperCounter.count || 0
    },
    tiktokApi: {
      currentKey: tiktokIdx + 1,
      totalKeys: TIKTOK_API_KEYS.length,
      deadKeys: [...tiktokDead],
      requests: tiktokCounter.count || 0
    }
  });
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 TikFeed rodando na porta ${PORT}`);
  console.log(`   Scraper Keys: ${SCRAPER_KEYS.length}`);
  console.log(`   TikTok API Keys: ${TIKTOK_API_KEYS.length}`);
  console.log(`   Total de keys: ${SCRAPER_KEYS.length + TIKTOK_API_KEYS.length}\n`);
});
