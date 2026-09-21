/* ============================================================
   app.js — VidSnap Frontend Logic
   ============================================================ */

// ---- Config ----
// Ganti dengan URL backend kamu setelah deploy ke Railway/Render
const API_BASE_URL = 'https://web-nnj1.onrender.com';

// ---- State ----
let currentPlatform = 'youtube';
let currentVideoInfo = null;
let selectedQuality = null;

// ---- DOM Elements ----
const urlInput = document.getElementById('url-input');
const searchBtn = document.getElementById('search-btn');
const pasteBtn = document.getElementById('paste-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const loadingState = document.getElementById('loading-state');
const loadingText = document.getElementById('loading-text');
const videoCard = document.getElementById('video-card');
const videoTitle = document.getElementById('video-title-display');
const videoThumbnail = document.getElementById('video-thumbnail');
const metaDurationText = document.getElementById('meta-duration-text');
const metaAuthorText = document.getElementById('meta-author-text');
const qualityOptions = document.getElementById('quality-options');
const downloadBtn = document.getElementById('download-btn');
const downloadBtnText = document.getElementById('download-btn-text');
const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressPct = document.getElementById('progress-pct');
const progressStatus = document.getElementById('progress-status');
const platformBadgeImg = document.getElementById('platform-badge-img');
const navbar = document.getElementById('navbar');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initNavScroll();
  initPlatformTabs();
  initFAQ();
  initStats();
  initInputAutoDetect();
});

// ============================================================
// PARTICLES
// ============================================================
function initParticles() {
  const container = document.getElementById('particles');
  const count = 30;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const size = Math.random() * 3 + 1;
    const x = Math.random() * 100;
    const delay = Math.random() * 20;
    const duration = Math.random() * 15 + 10;
    const opacity = Math.random() * 0.3 + 0.05;
    p.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: rgba(167, 139, 250, ${opacity});
      left: ${x}%;
      bottom: -10px;
      animation: particleRise ${duration}s ${delay}s linear infinite;
    `;
    container.appendChild(p);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes particleRise {
      0% { transform: translateY(0) translateX(0); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 0.5; }
      100% { transform: translateY(-100vh) translateX(${Math.random() > 0.5 ? '+' : '-'}${Math.random() * 100}px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// NAVBAR SCROLL
// ============================================================
function initNavScroll() {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// ============================================================
// PLATFORM TABS
// ============================================================
function initPlatformTabs() {
  const tabs = document.querySelectorAll('.platform-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPlatform = tab.dataset.platform;
      updatePlaceholder();
      resetVideoCard();
    });
  });
}

function updatePlaceholder() {
  if (currentPlatform === 'youtube') {
    urlInput.placeholder = 'Paste link YouTube di sini... (youtube.com, youtu.be)';
    document.getElementById('input-hint').textContent = 'Contoh: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  } else {
    urlInput.placeholder = 'Paste link TikTok di sini... (tiktok.com/@...)';
    document.getElementById('input-hint').textContent = 'Contoh: https://www.tiktok.com/@username/video/1234567890';
  }
}

// ============================================================
// AUTO DETECT PLATFORM FROM URL
// ============================================================
function initInputAutoDetect() {
  urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    if (!val) return;

    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(val);
    const isTikTok = /tiktok\.com/i.test(val);

    const tabs = document.querySelectorAll('.platform-tab');

    if (isYouTube && currentPlatform !== 'youtube') {
      tabs.forEach(t => t.classList.remove('active'));
      document.getElementById('tab-youtube').classList.add('active');
      currentPlatform = 'youtube';
      updatePlaceholder();
    } else if (isTikTok && currentPlatform !== 'tiktok') {
      tabs.forEach(t => t.classList.remove('active'));
      document.getElementById('tab-tiktok').classList.add('active');
      currentPlatform = 'tiktok';
      updatePlaceholder();
    }
  });

  // Enter key triggers search
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchVideoInfo();
    }
  });
}

// ============================================================
// PASTE BUTTON
// ============================================================
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
    urlInput.dispatchEvent(new Event('input'));
    showToast('Link berhasil di-paste!');
  } catch {
    urlInput.focus();
    showToast('Tekan Ctrl+V untuk paste', 'info');
  }
});

// ============================================================
// SEARCH BUTTON
// ============================================================
searchBtn.addEventListener('click', fetchVideoInfo);

// ============================================================
// FETCH VIDEO INFO
// ============================================================
async function fetchVideoInfo() {
  const url = urlInput.value.trim();

  if (!url) {
    showError('Masukkan link YouTube atau TikTok terlebih dahulu!');
    return;
  }

  if (!isValidUrl(url)) {
    showError('URL tidak valid. Pastikan link YouTube atau TikTok yang benar.');
    return;
  }

  // UI state: loading
  hideError();
  resetVideoCard();
  showLoading(true);
  setLoadingText('Mengambil info video...');

  try {
    const response = await fetch(`${API_BASE_URL}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, platform: currentPlatform })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Gagal mengambil info video.');
    }

    const data = await response.json();
    currentVideoInfo = data;
    displayVideoInfo(data);

  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      showError('Tidak dapat terhubung ke server. Pastikan backend sudah berjalan!');
    } else {
      showError(err.message || 'Terjadi kesalahan. Coba lagi.');
    }
  } finally {
    showLoading(false);
  }
}

// ============================================================
// DISPLAY VIDEO INFO
// ============================================================
function displayVideoInfo(data) {
  // Thumbnail
  if (data.thumbnail) {
    videoThumbnail.src = data.thumbnail;
    videoThumbnail.onerror = () => {
      videoThumbnail.src = 'https://placehold.co/320x180/1a1a2e/8b5cf6?text=VidSnap';
    };
  } else {
    videoThumbnail.src = 'https://placehold.co/320x180/1a1a2e/8b5cf6?text=VidSnap';
  }

  // Platform badge
  platformBadgeImg.textContent = data.platform === 'youtube' ? 'YouTube' : 'TikTok';
  platformBadgeImg.className = `platform-badge ${data.platform}`;

  // Title
  videoTitle.textContent = data.title || 'Video';

  // Duration
  metaDurationText.textContent = data.duration ? formatDuration(data.duration) : '-';

  // Author
  metaAuthorText.textContent = data.uploader || data.author || '-';

  // Quality options
  renderQualityOptions(data.formats || [], data.platform);

  // Show card
  videoCard.style.display = 'block';
  progressSection.style.display = 'none';
}

// ============================================================
// RENDER QUALITY OPTIONS
// ============================================================
function renderQualityOptions(formats, platform) {
  qualityOptions.innerHTML = '';
  selectedQuality = null;

  if (platform === 'tiktok' || formats.length === 0) {
    // TikTok — satu pilihan saja
    const opt = createQualityBtn({ label: 'HD (Tanpa WM)', format_id: 'best', ext: 'mp4' }, true);
    qualityOptions.appendChild(opt);
    selectedQuality = { format_id: 'best', ext: 'mp4', label: 'HD (Tanpa WM)' };
    return;
  }

  // YouTube — tampilkan pilihan
  formats.forEach((fmt, i) => {
    const opt = createQualityBtn(fmt, i === 0);
    qualityOptions.appendChild(opt);
    if (i === 0) selectedQuality = fmt;
  });
}

function createQualityBtn(fmt, isSelected) {
  const btn = document.createElement('button');
  btn.className = `quality-opt${fmt.ext === 'mp3' || fmt.label?.includes('MP3') ? ' audio' : ''}${isSelected ? ' selected' : ''}`;
  btn.textContent = fmt.label || fmt.format_note || fmt.format_id;
  btn.dataset.formatId = fmt.format_id;
  btn.addEventListener('click', () => {
    document.querySelectorAll('.quality-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedQuality = fmt;
    progressSection.style.display = 'none';
  });
  return btn;
}

// ============================================================
// DOWNLOAD BUTTON
// ============================================================
downloadBtn.addEventListener('click', async () => {
  if (!currentVideoInfo || !selectedQuality) {
    showError('Pilih kualitas video terlebih dahulu!');
    return;
  }

  const url = urlInput.value.trim();
  downloadBtn.disabled = true;
  downloadBtnText.textContent = 'Memproses...';
  progressSection.style.display = 'flex';
  animateProgress(0, 30, 'Menghubungi server...');

  try {
    const response = await fetch(`${API_BASE_URL}/api/download-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        format_id: selectedQuality.format_id,
        platform: currentPlatform
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Gagal memproses video.');
    }

    animateProgress(30, 80, 'Menyiapkan link download...');
    const data = await response.json();

    animateProgress(80, 100, 'Selesai! Membuka download...');

    await sleep(600);

    // Trigger download — LEWAT PROXY backend (/api/stream), BUKAN link CDN
    // langsung. TikTok/YouTube CDN sering menolak (403) request langsung
    // dari browser user karena tidak ada header Referer yang sesuai, jadi
    // backend yang mengambilkan filenya lalu meneruskan ke browser.
    if (data.download_url) {
      const filename = sanitizeFilename(currentVideoInfo.title || 'vidsnap');
      const ext = selectedQuality.ext || 'mp4';
      const proxyUrl = `${API_BASE_URL}/api/stream?` + new URLSearchParams({
        media_url: data.download_url,
        platform: currentPlatform,
        filename,
        ext
      }).toString();

      const a = document.createElement('a');
      a.href = proxyUrl;
      a.download = `${filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Download dimulai! Cek folder Downloads kamu 🎉');
    } else {
      throw new Error('Link download tidak tersedia.');
    }

  } catch (err) {
    showError(err.message || 'Gagal download. Coba lagi.');
    progressSection.style.display = 'none';
  } finally {
    downloadBtn.disabled = false;
    downloadBtnText.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Sekarang';
  }
});

// ============================================================
// PROGRESS ANIMATION
// ============================================================
function animateProgress(from, to, status) {
  progressFill.style.width = to + '%';
  progressPct.textContent = to + '%';
  if (status) progressStatus.textContent = status;
}

// ============================================================
// FAQ ACCORDION
// ============================================================
function initFAQ() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    const btn = item.querySelector('.faq-question');
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Close all
      items.forEach(i => i.classList.remove('open'));
      // Open clicked if wasn't open
      if (!isOpen) item.classList.add('open');
    });
  });
}

// ============================================================
// STATS COUNTER ANIMATION
// ============================================================
function initStats() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateStats();
        observer.disconnect();
      }
    });
  }, { threshold: 0.3 });

  const statsSection = document.getElementById('stats-section');
  if (statsSection) observer.observe(statsSection);
}

function animateStats() {
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(0) + 'JT+';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'RB+';
    return num + (num === 99 ? '%' : '');
  };

  const stats = [
    { id: 'stat-1', target: 10000000 },
    { id: 'stat-2', target: 500000 },
    { id: 'stat-3', target: 99 },
  ];

  stats.forEach(({ id, target }) => {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const increment = target / 60;
    const timer = setInterval(() => {
      current = Math.min(current + increment, target);
      el.textContent = formatNumber(Math.floor(current));
      if (current >= target) clearInterval(timer);
    }, 25);
  });
}

// ============================================================
// HELPERS
// ============================================================
function isValidUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(url);
}

function formatDuration(seconds) {
  const s = parseInt(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').substring(0, 80).trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.style.display = 'flex';
  setTimeout(() => { errorMsg.style.display = 'none'; }, 6000);
}

function hideError() {
  errorMsg.style.display = 'none';
}

function showLoading(show) {
  loadingState.style.display = show ? 'flex' : 'none';
}

function setLoadingText(text) {
  loadingText.textContent = text;
}

function resetVideoCard() {
  videoCard.style.display = 'none';
  currentVideoInfo = null;
  selectedQuality = null;
}

let toastTimer = null;
function showToast(msg, type = 'success') {
  toastText.textContent = msg;
  toast.style.background = type === 'success'
    ? 'rgba(74, 222, 128, 0.15)'
    : 'rgba(167, 139, 250, 0.15)';
  toast.style.borderColor = type === 'success'
    ? 'rgba(74, 222, 128, 0.4)'
    : 'rgba(167, 139, 250, 0.4)';
  toast.style.color = type === 'success' ? '#4ade80' : '#a78bfa';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
