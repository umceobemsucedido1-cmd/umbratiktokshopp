/* ═══════════════════════════════════════════
   Umbra Hub — app.js
   Frontend logic. Calls /api/* from backend.
═══════════════════════════════════════════ */

// ─── STATE ───────────────────────────────
let allVideos  = [];
let filtered   = [];
let cursor     = 0;
let loading    = false;
let mode       = 'trending';
let keyword    = '';
let filterMode = 'all';
let autoTimer  = null;
let totalSales = 0;
let totalViews = 0;
let statusData = null;

// ─── STATUS POLLING ───────────────────────
async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    statusData = await res.json();
    renderKeyPanels();
    updateHdr();
    document.getElementById('s-reqs').textContent =
      fmt((statusData.scraper.requests || 0) + (statusData.tiktokApi.requests || 0));
  } catch {}
}

function renderKeyPanels() {
  if (!statusData) return;
  const renderPanel = (el, current, total, dead) => {
    if (!el) return;
    el.innerHTML = Array.from({length: total}, (_, i) => {
      const st = dead.includes(i) ? 'dead' : i === current - 1 ? 'active' : 'used';
      const ic = st === 'active' ? '●' : st === 'dead' ? '✕' : '○';
      return `<div class="kbadge ${st}">${ic} K${i+1}</div>`;
    }).join('');
  };
  renderPanel(
    document.getElementById('key-panel-scraper'),
    statusData.scraper.currentKey,
    statusData.scraper.totalKeys,
    statusData.scraper.deadKeys
  );
  renderPanel(
    document.getElementById('key-panel-tiktok'),
    statusData.tiktokApi.currentKey,
    statusData.tiktokApi.totalKeys,
    statusData.tiktokApi.deadKeys
  );
}

function updateHdr() {
  if (!statusData) return;
  const el = document.getElementById('key-hdr');
  if (el) el.textContent =
    `S:${statusData.scraper.currentKey}/${statusData.scraper.totalKeys} · T:${statusData.tiktokApi.currentKey}/${statusData.tiktokApi.totalKeys}`;
}

// ─── FETCH HELPERS ─────────────────────────
async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── LOAD STRATEGIES ──────────────────────
async function fetchTrending() {
  const region = document.getElementById('region-sel').value;
  try {
    const d = await apiFetch(`/api/tiktok/trending?region=${region}&count=20&cursor=${cursor}`);
    if (d.ok) {
      cursor = d.data?.data?.cursor || d.data?.cursor || cursor + 20;
      return extractItems(d.data);
    }
  } catch {}
  const d = await apiFetch(`/api/trending?region=${region}&count=20&cursor=${cursor}`);
  cursor = d.data?.data?.cursor || d.data?.cursor || cursor + 20;
  return extractItems(d.data);
}

async function fetchExplore() {
  const region = document.getElementById('region-sel').value;
  const d = await apiFetch(`/api/tiktok/explore?region=${region}&count=20&cursor=${cursor}`);
  cursor = d.data?.data?.cursor || cursor + 20;
  return extractItems(d.data);
}

async function fetchShop() {
  const region = document.getElementById('region-sel').value;
  const d = await apiFetch(`/api/search?keywords=TikTokShop&count=20&cursor=${cursor}&region=${region}`);
  cursor = d.data?.data?.cursor || cursor + 20;
  return extractItems(d.data);
}

async function fetchAds() {
  const d = await apiFetch(`/api/tiktok/ads/trending?count=20&cursor=${cursor}`);
  cursor = d.data?.data?.cursor || cursor + 20;
  return extractItems(d.data);
}

async function fetchKeyword(kw) {
  const region = document.getElementById('region-sel').value;
  try {
    const d = await apiFetch(`/api/tiktok/search?keywords=${encodeURIComponent(kw)}&count=20&cursor=${cursor}&region=${region}`);
    if (d.ok && extractItems(d.data).length > 0) {
      cursor = d.data?.data?.cursor || cursor + 20;
      return extractItems(d.data);
    }
  } catch {}
  const d = await apiFetch(`/api/search?keywords=${encodeURIComponent(kw)}&count=20&cursor=${cursor}&region=${region}`);
  cursor = d.data?.data?.cursor || cursor + 20;
  return extractItems(d.data);
}

function extractItems(data) {
  return data?.data?.videos
      || data?.data?.posts
      || data?.itemList
      || data?.items
      || [];
}

// ─── LOAD VIDEOS ──────────────────────────
async function loadVideos(reset = true) {
  if (loading) return;
  loading = true;

  if (reset) {
    cursor = 0;
    allVideos = [];
    filtered = [];
    totalSales = 0;
    totalViews = 0;
    document.getElementById('video-grid').innerHTML =
      `<div class="loader-wrap"><div class="loader"></div><div class="loader-msg">BUSCANDO VÍDEOS...</div></div>`;
  }

  try {
    let items = [];
    if      (mode === 'trending') items = await fetchTrending();
    else if (mode === 'explore')  items = await fetchExplore();
    else if (mode === 'shop')     items = await fetchShop();
    else if (mode === 'ads')      items = await fetchAds();
    else if (mode === 'keyword')  items = await fetchKeyword(keyword);

    processItems(items, reset);
    await pollStatus();

  } catch (err) {
    console.error(err);
    if (allVideos.length === 0) {
      document.getElementById('video-grid').innerHTML =
        `<div class="loader-wrap" style="color:var(--red2)">
          <div style="font-size:2rem">⚠️</div>
          <div class="loader-msg">${err.message} — TENTANDO NOVAMENTE</div>
        </div>`;
      setTimeout(() => { loading = false; loadVideos(reset); }, 2000);
      return;
    }
  }

  loading = false;
}

// ─── PROCESS ITEMS ────────────────────────
function processItems(items, reset) {
  if (!items?.length) return;

  items.forEach(item => {
    // 1. Unified Data Extraction
    const stats  = item.stats || item.statistics || item.statistics_info || {};
    const author = item.author || item.authorInfo || item.author_info || {};
    const video  = item.video  || item.video_info || {};

    const views    = parseInt(stats.playCount || stats.play_count || stats.view_count || item.play_count || 0);
    const likes    = parseInt(stats.diggCount || stats.digg_count || stats.like_count || item.digg_count || 0);
    const comments = parseInt(stats.commentCount || stats.comment_count || 0);
    const shares   = parseInt(stats.shareCount || stats.share_count || 0);

    totalViews += views;
    const est = estimateSales(views, likes);
    totalSales += est;

    // 2. Cover / Thumbnail
    const cover = video.cover || video.originCover || video.dynamicCover
               || item.cover || item.thumbnail || item.cover_url || '';

    // 3. Robust URL Construction (Fix for "Página indisponível")
    const uniqueId = author.uniqueId || author.unique_id || author.nickname || author.user_id || '';
    const videoId  = item.id || item.aweme_id || item.video_id || '';
    
    // Clean uniqueId (ensure no spaces, handle @)
    let cleanId = uniqueId.replace(/^@/, '').trim();
    
    let url = '';
    if (videoId) {
      if (cleanId) {
        url = `https://www.tiktok.com/@${cleanId}/video/${videoId}`;
      } else {
        url = `https://www.tiktok.com/video/${videoId}`;
      }
    } else {
      url = cleanId ? `https://www.tiktok.com/@${cleanId}` : 'https://www.tiktok.com';
    }

    const engRate = views > 0 ? (likes / views) : 0;
    const descText = item.desc || item.title || item.description || 'Sem descrição';

    allVideos.push({
      id:      videoId || Math.random().toString(36).slice(2),
      author:  cleanId || 'User',
      desc:    descText,
      cover,
      views, likes, comments, shares, est,
      engRate,
      hasShop: !!(item.product || item.anchors?.length
               || descText.toLowerCase().includes('shop')
               || descText.toLowerCase().includes('link')
               || descText.toLowerCase().includes('comprar')),
      isViral:   views > 1_000_000,
      isTrend:   views > 500_000,
      isHighEng: engRate > 0.08,
      ts:    item.createTime || item.create_time || Date.now() / 1000,
      url
    });
  });

  applyFilter();
  updateStats();
}

// ─── FILTER ───────────────────────────────
function filterBy(f, el) {
  document.querySelectorAll('.filter-strip .pill').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  filterMode = f;
  applyFilter();
}

function applyFilter() {
  const now = Date.now() / 1000;
  filtered = allVideos.filter(v => {
    if (filterMode === 'shop')    return v.hasShop;
    if (filterMode === 'trending') return v.isTrend;
    if (filterMode === 'viral')   return v.isViral;
    if (filterMode === 'new')     return (now - v.ts) < 86400 * 3;
    if (filterMode === 'higheng') return v.isHighEng;
    return true;
  });
  renderGrid();
}

// ─── RENDER ───────────────────────────────
function renderGrid() {
  const modeLabels = {
    trending: 'TRENDING NOW',
    shop:     'TIKTOK SHOP INSIGHTS',
    ads:      'ADS GALLERY',
    explore:  'EXPLORE FEED',
    keyword:  keyword.toUpperCase()
  };
  
  const labelEl = document.getElementById('grid-label');
  if (labelEl) {
    labelEl.textContent = `${modeLabels[mode] || mode.toUpperCase()} — ${filtered.length} INTELLIGENCE NODES`;
  }

  const container = document.getElementById('video-grid');
  if (!filtered.length) {
    container.innerHTML = `
      <div class="loader-wrap">
        <div style="font-size:3rem; opacity:0.2; margin-bottom:1rem;">🛰️</div>
        <div class="loader-msg">DATA STREAM EMPTY — TRY ANOTHER REGION OR KEYWORD</div>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map((v, i) => `
    <div class="vcard" style="animation-delay: ${(i % 12) * 0.05}s" onclick="openModal(${allVideos.indexOf(v)})">
      <div class="vthumb">
        ${v.cover
          ? `<img src="${v.cover}" alt="@${v.author}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=500&auto=format&fit=crop'">`
          : '<div class="vthumb-ph">🎬</div>'}
        
        <div class="vbadge ${v.isViral ? 'vbadge-cyan' : 'vbadge-red'}">
          ${v.hasShop ? '🛒 SHOP' : v.isViral ? '⚡ VIRAL' : '🔥 TREND'}
        </div>
        
        <div class="vviews">▶ ${fmt(v.views)}</div>
        <div class="vplay"><span>▶</span></div>
      </div>
      <div class="vinfo">
        <div class="vauthor">@${v.author}</div>
        <div class="vdesc">${v.desc}</div>
        <div class="vmeta">
          <span>❤️ ${fmt(v.likes)}</span>
          <span>💬 ${fmt(v.comments)}</span>
          <span>↗️ ${fmt(v.shares)}</span>
        </div>
        <div class="vest">
          <span>💰 Est. Revenue</span>
          <strong>~${fmt(v.est)}</strong>
        </div>
      </div>
    </div>
  `).join('');
}

function updateStats() {
  document.getElementById('s-vids').textContent  = fmt(allVideos.length);
  document.getElementById('s-views').textContent = fmt(totalViews);
  document.getElementById('s-sales').textContent = fmt(totalSales);
}

// ─── MODAL ────────────────────────────────
function openModal(idx) {
  const v = allVideos[idx];
  if (!v) return;

  const engPct = v.views > 0 ? ((v.likes / v.views) * 100).toFixed(2) : '0.00';
  const modalBody = document.getElementById('modal-body');
  
  modalBody.innerHTML = `
    <div class="modal-content-wrap">
      <div class="modal-main-row">
        <div class="modal-media">
          ${v.cover 
            ? `<img src="${v.cover}" alt="@${v.author}" onerror="this.src='https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=500&auto=format&fit=crop'">`
            : '<div class="vthumb-ph">🎬</div>'}
          <div class="modal-play-overlay"><span>▶</span></div>
        </div>
        
        <div class="modal-details">
          <div class="modal-header">
            <div class="modal-author-info">
              <div class="modal-author-name">@${v.author}</div>
              <div class="modal-engagement-tag ${v.isHighEng ? 'high' : ''}">${v.isHighEng ? '💎 EXCELLENT ENGAGEMENT' : '📈 GROWING'}</div>
            </div>
          </div>
          
          <div class="modal-desc-box">
             <p>${v.desc}</p>
          </div>

          <div class="modal-stats-grid">
            <div class="ms-item">
              <span class="ms-label">VIEWS</span>
              <span class="ms-value">${fmt(v.views)}</span>
            </div>
            <div class="ms-item">
              <span class="ms-label">LIKES</span>
              <span class="ms-value">${fmt(v.likes)}</span>
            </div>
            <div class="ms-item">
              <span class="ms-label">ENG.%</span>
              <span class="ms-value" style="color: var(--accent)">${engPct}%</span>
            </div>
            <div class="ms-item">
              <span class="ms-label">EST. SALES</span>
              <span class="ms-value" style="color: var(--green)">${fmt(v.est)}</span>
            </div>
          </div>

          <div class="modal-actions-row">
            <a href="${v.url}" target="_blank" class="btn btn-purple" style="flex: 1">
              <span>▶</span> Open on TikTok
            </a>
            <button class="btn btn-ghost" onclick="copyUrl('${v.url}')" title="Copy Link">
              <span>📋</span>
            </button>
          </div>
        </div>
      </div>

      <div class="modal-footer-promo">
        <div class="promo-card gold">
          <div class="promo-text">
            <strong>Monetização Pro</strong>
            <p>Aprenda a escalar canais de cortes e shop.</p>
          </div>
          <a href="https://pay.cakto.com.br/3bs9cfh_650634" target="_blank" class="btn btn-purple" style="padding: 8px 16px; font-size: 0.7rem;">Saber Mais</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modal-bg').classList.add('open');
}

function copyUrl(url) {
  navigator.clipboard.writeText(url);
  const btn = event.currentTarget;
  const oldText = btn.innerHTML;
  btn.innerHTML = '<span>✅</span>';
  setTimeout(() => btn.innerHTML = oldText, 2000);
}

function closeModal(e) {
  if (!e || e.target.id === 'modal-bg' || e.target.id === 'modal-close') {
    document.getElementById('modal-bg').classList.remove('open');
  }
}

// ─── NAVIGATION ───────────────────────────
function setMode(m, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  mode = m; keyword = '';
  loadVideos(true);
}

function setKeyword(kw, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  mode = 'keyword'; keyword = kw;
  loadVideos(true);
}

function buscarManual() {
  const val = document.getElementById('search-input').value.trim();
  if (!val) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  mode = 'keyword'; keyword = val;
  loadVideos(true);
}

function reload() { loadVideos(true); }

function autoRefreshToggle() {
  const btn = document.getElementById('auto-btn');
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    btn.textContent = '⏱ Auto';
  } else {
    autoTimer = setInterval(() => loadVideos(true), 30000);
    btn.textContent = '⏸ Pausar';
  }
}

// ─── INFINITE SCROLL ──────────────────────
const obs = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && allVideos.length > 0 && !loading) {
    loadVideos(false);
  }
}, { threshold: 0.1 });

const trigger = document.getElementById('scroll-trigger');
if (trigger) obs.observe(trigger);

// ─── HELPERS ──────────────────────────────
function fmt(n) {
  n = +n;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n || 0);
}

function estimateSales(views, likes) {
  if (!views) return 0;
  const eng  = likes / views;
  const conv = eng > 0.10 ? 0.02 : eng > 0.05 ? 0.015 : eng > 0.02 ? 0.01 : 0.005;
  return Math.round(views * conv);
}

// ─── INIT ─────────────────────────────────
pollStatus();
setInterval(pollStatus, 10000);
loadVideos(true);
