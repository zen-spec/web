const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve folder public (untuk mode Localhost)
app.use(express.static(path.join(__dirname, '../public')));

// Helper: Deteksi Platform & ID
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return null;
}

function extractYTId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

// ============================================================
// 📥 ENDPOINT PROXY DOWNLOAD (Paksa Direct File Download)
// ============================================================
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL media tidak ditemukan');

    const cleanFilename = (filename || 'saweria_download').replace(/[^a-zA-Z0-9._-]/g, '_');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return res.redirect(url);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Header khusus agar browser langsung unduh file di tempat
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    res.setHeader('Content-Type', contentType);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);

  } catch (err) {
    console.error('Download Proxy Error:', err);
    if (req.query.url) return res.redirect(req.query.url);
    return res.status(500).send('Terjadi kesalahan saat mengunduh file.');
  }
});

// ------------------------------------------
// 1. TIKTOK HANDLER
// ------------------------------------------
async function handleTikTok(url, res) {
  try {
    const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const json = await response.json();

    if (!json || json.code !== 0) {
      return res.status(400).json({ status: false, message: 'Gagal mengekstrak video TikTok.' });
    }

    const data = json.data;
    const downloads = [];

    if (data.play) downloads.push({ type: 'video', quality: 'No Watermark (HD)', url: data.play });
    if (data.wmplay) downloads.push({ type: 'video', quality: 'With Watermark', url: data.wmplay });
    if (data.music) downloads.push({ type: 'audio', quality: 'Audio Original (MP3)', url: data.music });

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
    return res.status(500).json({ status: false, message: 'Gagal memproses video TikTok.' });
  }
}

// ------------------------------------------
// 2. YOUTUBE HANDLER (Cobalt Engine)
// ------------------------------------------
async function handleYouTube(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  let title = `YouTube Video (${videoId})`;
  let author = 'YouTube Creator';

  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`);
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      if (oembedData.title) title = oembedData.title;
      if (oembedData.author_name) author = oembedData.author_name;
    }
  } catch (e) {}

  try {
    const mp4Res = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: cleanUrl,
        videoQuality: '720',
        downloadMode: 'auto'
      })
    });

    const mp3Res = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: cleanUrl,
        downloadMode: 'audio',
        audioFormat: 'mp3'
      })
    });

    const mp4Data = mp4Res.ok ? await mp4Res.json() : null;
    const mp3Data = mp3Res.ok ? await mp3Res.json() : null;

    const downloads = [];

    if (mp4Data && mp4Data.url) {
      downloads.push({
        type: 'video',
        quality: '720p HD MP4',
        url: mp4Data.url
      });
    }

    if (mp3Data && mp3Data.url) {
      downloads.push({
        type: 'audio',
        quality: 'Audio MP3',
        url: mp3Data.url
      });
    }

    if (downloads.length > 0) {
      return res.json({
        status: true,
        platform: 'youtube',
        title,
        author,
        duration: 'HD',
        thumbnail,
        downloads
      });
    }
  } catch (err) {
    console.error('Cobalt Direct Fetch Error:', err.message);
  }

  return res.status(500).json({
    status: false,
    message: 'Gagal mengambil video YouTube. Silakan coba beberapa saat lagi.'
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

// Port Server Lokal
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 Server aktif di http://localhost:${PORT}`));
}

module.exports = app;
