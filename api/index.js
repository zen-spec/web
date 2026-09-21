const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve folder public (untuk mode Localhost)
app.use(express.static(path.join(__dirname, '../public')));

// Helper: Deteksi Platform
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return null;
}

// Helper: Ekstrak ID Video YouTube
function extractYTId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

// ------------------------------------------
// 1. TIKTOK HANDLER (TikWM Engine - Fast & Stable)
// ------------------------------------------
async function handleTikTok(url, res) {
  try {
    const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const json = await response.json();

    if (!json || json.code !== 0) {
      return res.status(400).json({ 
        status: false, 
        message: 'Gagal mengekstrak video TikTok. Pastikan link publik dan valid.' 
      });
    }

    const data = json.data;
    const downloads = [];

    if (data.play) {
      downloads.push({ type: 'video', quality: 'No Watermark (HD)', url: data.play });
    }
    if (data.wmplay) {
      downloads.push({ type: 'video', quality: 'With Watermark', url: data.wmplay });
    }
    if (data.music) {
      downloads.push({ type: 'audio', quality: 'Audio Original (MP3)', url: data.music });
    }

    return res.json({
      status: true,
      platform: 'tiktok',
      title: data.title || 'TikTok Video',
      author: data.author?.nickname || `@${data.author?.unique_id}` || 'TikTok Creator',
      duration: data.duration ? `${data.duration}s` : 'N/A',
      thumbnail: data.cover || data.origin_cover || '',
      downloads
    });
  } catch (err) {
    console.error('TikTok API Error:', err);
    return res.status(500).json({ 
      status: false, 
      message: 'Gagal terhubung ke server TikTok. Silakan coba lagi.' 
    });
  }
}

// ------------------------------------------
// 2. YOUTUBE HANDLER (Anti-Block & Fast Response)
// ------------------------------------------
async function handleYouTube(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const downloads = [];

  // 1. Coba ambil Direct Stream MP4 via Cobalt API
  try {
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: JSON.stringify({ url: url, vQuality: '720' })
    });

    if (cobaltRes.ok) {
      const cobaltData = await cobaltRes.json();
      if (cobaltData && cobaltData.url) {
        downloads.push({
          type: 'video',
          quality: '720p MP4 (Direct Stream)',
          url: cobaltData.url
        });
      }
    }
  } catch (err) {
    // Abaikan jika Cobalt timeout/diblokir oleh YouTube di Vercel
  }

  // 2. Opsi Unduhan Cadangan (Bypass Blokir IP Vercel)
  downloads.push(
    {
      type: 'video',
      quality: 'Download MP4 (Fast Server 1)',
      url: `https://ssyoutube.com/watch?v=${videoId}`
    },
    {
      type: 'audio',
      quality: 'Download MP3 (Fast Server 2)',
      url: `https://www.y2mate.com/youtube/${videoId}`
    },
    {
      type: 'video',
      quality: 'Cobalt Downloader Web',
      url: `https://cobalt.tools`
    }
  );

  return res.json({
    status: true,
    platform: 'youtube',
    title: `YouTube Video (${videoId})`,
    author: 'YouTube Content',
    duration: 'N/A',
    thumbnail: thumbnail,
    downloads: downloads
  });
}

// Endpoint Utama API
app.post('/api/fetch', async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ status: false, message: 'URL tidak boleh kosong!' });
  }

  const platform = detectPlatform(url);

  if (platform === 'youtube') {
    return handleYouTube(url, res);
  } else if (platform === 'tiktok') {
    return handleTikTok(url, res);
  } else {
    return res.status(400).json({
      status: false,
      message: 'URL tidak didukung! Masukkan URL YouTube atau TikTok yang valid.'
    });
  }
});

// Port Server Lokal (Localhost)
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server aktif di http://localhost:${PORT}`);
  });
}

module.exports = app;
