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
// 1. TIKTOK HANDLER (TikWM Engine - Fast)
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
    return res.status(500).json({ status: false, message: 'Gagal memproses TikTok dari server.' });
  }
}

// ------------------------------------------
// 2. YOUTUBE HANDLER (Official oEmbed - Guaranteed Vercel Success)
// ------------------------------------------
async function handleYouTube(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  try {
    // Ambil Judul & Author via YouTube oEmbed Resmi (Bebas Blokir IP Vercel)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);

    let title = `YouTube Video (${videoId})`;
    let author = 'YouTube Content Creator';

    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      if (oembedData.title) title = oembedData.title;
      if (oembedData.author_name) author = oembedData.author_name;
    }

    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Link download langsung yang kompatibel untuk browser user
    const downloads = [
      {
        type: 'video',
        quality: 'Download MP4 (Server 1)',
        url: `https://ssyoutube.com/watch?v=${videoId}`
      },
      {
        type: 'audio',
        quality: 'Download MP3 (Server 2)',
        url: `https://yt1s.de/en/youtube-to-mp3?q=${encodeURIComponent(cleanUrl)}`
      },
      {
        type: 'video',
        quality: 'Alternative Downloader (Cobalt)',
        url: `https://cobalt.tools`
      }
    ];

    return res.json({
      status: true,
      platform: 'youtube',
      title: title,
      author: author,
      duration: 'HD Quality',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      downloads: downloads
    });

  } catch (err) {
    console.error('YouTube Fetch Error:', err);
    return res.status(500).json({ status: false, message: 'Gagal memproses video YouTube.' });
  }
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
