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
// 1. TIKTOK HANDLER (Direct MP4/MP3)
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
    return res.status(500).json({ status: false, message: 'Gagal memproses video TikTok.' });
  }
}

// ------------------------------------------
// 2. YOUTUBE HANDLER (Direct Stream - No Redirect)
// ------------------------------------------
async function handleYouTube(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // 1. Ambil Metadata Video (Judul & Uploader) via YouTube oEmbed Resmi
  let title = `YouTube Video (${videoId})`;
  let author = 'YouTube Creator';

  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`);
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      if (oembedData.title) title = oembedData.title;
      if (oembedData.author_name) author = oembedData.author_name;
    }
  } catch (e) {
    // Abaikan jika metadata gagal
  }

  // 2. Ambil Direct File Download Link (MP4 & MP3) via Cobalt Engine
  try {
    // Request Link MP4 Direct
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

    // Request Link MP3 Direct
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
        quality: '720p HD MP4 (Direct File)',
        url: mp4Data.url
      });
    }

    if (mp3Data && mp3Data.url) {
      downloads.push({
        type: 'audio',
        quality: 'Audio MP3 (Direct File)',
        url: mp3Data.url
      });
    }

    // Jika Cobalt berhasil memberikan direct link
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

  // 3. Fallback Engine via Invidious Stream (Link Direct File Cadangan)
  try {
    const invRes = await fetch(`https://inv.tux.pizza/api/v1/videos/${videoId}`);
    if (invRes.ok) {
      const invData = await invRes.json();
      const formatStreams = invData.formatStreams || [];
      const bestMp4 = formatStreams.find(s => s.container === 'mp4' && s.qualityLabel) || formatStreams[0];

      if (bestMp4 && bestMp4.url) {
        return res.json({
          status: true,
          platform: 'youtube',
          title: invData.title || title,
          author: invData.author || author,
          duration: `${Math.floor((invData.lengthSeconds || 0) / 60)}m`,
          thumbnail,
          downloads: [
            {
              type: 'video',
              quality: `${bestMp4.qualityLabel || '720p'} MP4 (Direct Stream)`,
              url: bestMp4.url
            }
          ]
        });
      }
    }
  } catch (e) {
    console.error('Invidious Fallback Error:', e.message);
  }

  return res.status(500).json({
    status: false,
    message: 'Gagal mengekstrak link unduhan langsung. Silakan coba link YouTube lainnya.'
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
