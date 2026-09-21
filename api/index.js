const express = require('express');
const cors = require('cors');
const path = require('path');
const Tiktok = require('@maxinminax/tiktok-api-dl');
const yt = require('@vreden/youtube_scraper');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static public folder (untuk Localhost)
app.use(express.static(path.join(__dirname, '../public')));

// Helper: Deteksi Platform & Extract YT ID
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
// 1. YOUTUBE HANDLER (@vreden/youtube_scraper v1.2.9)
// ============================================================
async function handleYouTube(url, res) {
  try {
    // Panggil ytmp4 dan ytmp3 secara bersamaan
    const [mp4Res, mp3Res] = await Promise.allSettled([
      yt.ytmp4(url),
      yt.ytmp3(url)
    ]);

    const mp4Data = mp4Res.status === 'fulfilled' ? mp4Res.value : null;
    const mp3Data = mp3Res.status === 'fulfilled' ? mp3Res.value : null;

    // Normalisasi struktur output v1.2.9
    const mp4Result = mp4Data?.result || mp4Data;
    const mp3Result = mp3Data?.result || mp3Data;

    const videoId = extractYTId(url);
    const title = mp4Result?.title || mp3Result?.title || `YouTube Video (${videoId || ''})`;
    const author = mp4Result?.author || mp3Result?.author || mp4Result?.channel || 'YouTube Content';
    const duration = mp4Result?.duration || mp4Result?.timestamp || 'HD';
    const thumbnail = mp4Result?.thumbnail || mp4Result?.image || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '');

    const downloads = [];

    // Extract Link MP4
    const videoUrl = mp4Result?.download?.url || mp4Result?.url || mp4Result?.download;
    if (videoUrl && typeof videoUrl === 'string') {
      downloads.push({
        type: 'video',
        quality: `${mp4Result?.quality || mp4Result?.download?.quality || '720p'} MP4`,
        url: videoUrl
      });
    }

    // Extract Link MP3
    const audioUrl = mp3Result?.download?.url || mp3Result?.url || mp3Result?.download;
    if (audioUrl && typeof audioUrl === 'string') {
      downloads.push({
        type: 'audio',
        quality: `${mp3Result?.quality || mp3Result?.download?.quality || '320kbps'} MP3`,
        url: audioUrl
      });
    }

    if (downloads.length === 0) {
      return res.status(400).json({
        status: false,
        message: 'Gagal mengekstrak link unduhan YouTube. Pastikan link YouTube publik.'
      });
    }

    return res.json({
      status: true,
      platform: 'youtube',
      title,
      author,
      duration,
      thumbnail,
      downloads
    });

  } catch (err) {
    console.error('YouTube v1.2.9 Error:', err);
    return res.status(500).json({
      status: false,
      message: 'Terjadi kesalahan saat memproses video YouTube.'
    });
  }
}

// ============================================================
// 2. TIKTOK HANDLER
// ============================================================
async function handleTikTok(url, res) {
  try {
    const result = await Tiktok.Downloader(url, { version: 'v1' });

    if (!result || result.status === 'error' || !result.result) {
      return res.status(400).json({ status: false, message: 'Gagal mengekstrak video TikTok.' });
    }

    const data = result.result;
    const downloads = [];

    if (data.video1 || data.play) {
      downloads.push({ type: 'video', quality: 'No Watermark (HD)', url: data.video1 || data.play });
    }
    if (data.wmplay || data.watermark) {
      downloads.push({ type: 'video', quality: 'With Watermark', url: data.wmplay || data.watermark });
    }
    if (data.music || data.music_info?.play) {
      downloads.push({ type: 'audio', quality: 'Audio Original (MP3)', url: data.music || data.music_info?.play });
    }

    return res.json({
      status: true,
      platform: 'tiktok',
      title: data.desc || data.description || 'TikTok Video',
      author: data.author?.nickname || data.author?.unique_id || 'TikTok User',
      duration: data.duration ? `${data.duration}s` : 'N/A',
      thumbnail: data.cover || data.origin_cover || '',
      downloads
    });
  } catch (err) {
    console.error('TikTok Error:', err);
    return res.status(500).json({ status: false, message: 'Gagal memproses video TikTok.' });
  }
}

// ============================================================
// 3. PROXY DOWNLOADER (Direct File Download)
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

// Endpoint Utama API
app.post('/api/fetch', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ status: false, message: 'URL tidak boleh kosong!' });

  const platform = detectPlatform(url);

  if (platform === 'youtube') return handleYouTube(url, res);
  if (platform === 'tiktok') return handleTikTok(url, res);

  return res.status(400).json({ status: false, message: 'URL tidak didukung!' });
});

// Port Server Lokal (Localhost)
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 Server aktif di http://localhost:${PORT}`));
}

module.exports = app;
