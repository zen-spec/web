const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Helper Deteksi URL
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return null;
}

// ------------------------------------------
// 1. FAST TIKTOK HANDLER (TikWM Engine)
// ------------------------------------------
async function handleTikTok(url, res) {
  try {
    const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const json = await response.json();

    if (!json || json.code !== 0) {
      return res.status(400).json({ status: false, message: 'Gagal mengekstrak video TikTok. Pastikan akun tidak diprivate.' });
    }

    const data = json.data;
    const downloads = [];

    // Video No Watermark
    if (data.play) {
      downloads.push({
        type: 'video',
        quality: 'No Watermark (HD)',
        url: data.play
      });
    }

    // Video Watermark
    if (data.wmplay) {
      downloads.push({
        type: 'video',
        quality: 'With Watermark',
        url: data.wmplay
      });
    }

    // Audio MP3
    if (data.music) {
      downloads.push({
        type: 'audio',
        quality: 'Audio Original (MP3)',
        url: data.music
      });
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
    console.error('TikTok Fast API Error:', err);
    return res.status(500).json({ status: false, message: 'Gagal memproses TikTok dari server.' });
  }
}

// ------------------------------------------
// 2. FAST YOUTUBE HANDLER (Cobalt Engine)
// ------------------------------------------
async function handleYouTube(url, res) {
  try {
    // Memakai Engine API Terbuka yang Ringan & Cepat
    const response = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: url,
        vQuality: '720'
      })
    });

    const json = await response.json();

    if (json.status === 'error' || !json.url) {
      // Fallback ke Invidious Public Engine jika Cobalt sibuk
      return await handleYouTubeFallback(url, res);
    }

    return res.json({
      status: true,
      platform: 'youtube',
      title: 'YouTube Video',
      author: 'YouTube Uploader',
      duration: 'N/A',
      thumbnail: `https://img.youtube.com/vi/${extractYTId(url)}/hqdefault.jpg`,
      downloads: [
        {
          type: 'video',
          quality: '720p HD MP4',
          url: json.url
        }
      ]
    });

  } catch (err) {
    return await handleYouTubeFallback(url, res);
  }
}

// YouTube Fallback Generator
async function handleYouTubeFallback(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  return res.json({
    status: true,
    platform: 'youtube',
    title: 'YouTube Video ' + videoId,
    author: 'YouTube Uploader',
    duration: 'N/A',
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    downloads: [
      {
        type: 'video',
        quality: 'Download MP4 (Fast)',
        url: `https://y2mate.is/download?url=${encodeURIComponent(url)}`
      },
      {
        type: 'audio',
        quality: 'Download MP3 (Fast)',
        url: `https://y2mate.is/download?url=${encodeURIComponent(url)}`
      }
    ]
  });
}

function extractYTId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

// Endpoint Utama
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

module.exports = app;
