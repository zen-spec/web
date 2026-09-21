const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve folder public (untuk mode localhost)
app.use(express.static(path.join(__dirname, '../public')));

// Helper Deteksi URL
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return null;
}

// Extract ID Video YouTube
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
      return res.status(400).json({ status: false, message: 'Gagal mengekstrak video TikTok. Pastikan video tidak diprivate.' });
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
    return res.status(500).json({ status: false, message: 'Gagal memproses video TikTok.' });
  }
}

// ------------------------------------------
// 2. YOUTUBE HANDLER (Direct Stream Engine - No Redirect 404)
// ------------------------------------------
async function handleYouTube(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  // Daftar instance Piped API untuk mengambil direct link tanpa Y2mate
  const pipedInstances = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://api.piped.yt/streams/${videoId}`,
    `https://pipedapi.tokhmi.xyz/streams/${videoId}`
  ];

  for (const endpoint of pipedInstances) {
    try {
      const response = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (!data || (!data.videoStreams && !data.audioStreams)) continue;

      const downloads = [];

      // Filter Video MP4 (Video + Audio)
      const videoMp4 = (data.videoStreams || []).filter(v => v.mimeType && v.mimeType.includes('video/mp4') && v.hasVideo);
      const bestVideo = videoMp4.length > 0 ? videoMp4[0] : (data.videoStreams || [])[0];

      if (bestVideo && bestVideo.url) {
        downloads.push({
          type: 'video',
          quality: `${bestVideo.quality || '720p'} MP4`,
          url: bestVideo.url
        });
      }

      // Filter Audio MP3/M4A
      const audioStreams = data.audioStreams || [];
      const bestAudio = audioStreams.find(a => a.mimeType && (a.mimeType.includes('audio/mp4') || a.mimeType.includes('audio/m4a'))) || audioStreams[0];

      if (bestAudio && bestAudio.url) {
        downloads.push({
          type: 'audio',
          quality: `${bestAudio.quality || '128kbps'} Audio (MP3/M4A)`,
          url: bestAudio.url
        });
      }

      if (downloads.length > 0) {
        const durationSec = data.duration || 0;
        const mins = Math.floor(durationSec / 60);
        const secs = (durationSec % 60).toString().padStart(2, '0');

        return res.json({
          status: true,
          platform: 'youtube',
          title: data.title || 'YouTube Video',
          author: data.uploader || 'YouTube Uploader',
          duration: `${mins}:${secs}`,
          thumbnail: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          downloads
        });
      }
    } catch (e) {
      console.error(`Attempt failed on ${endpoint}:`, e.message);
    }
  }

  // Fallback Engine (Cobalt) jika Piped instance sedang sibuk
  try {
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: url, vQuality: '720' })
    });
    const cobaltData = await cobaltRes.json();

    if (cobaltData && cobaltData.url) {
      return res.json({
        status: true,
        platform: 'youtube',
        title: 'YouTube Video',
        author: 'YouTube Uploader',
        duration: 'N/A',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        downloads: [
          { type: 'video', quality: '720p HD MP4 (Direct)', url: cobaltData.url }
        ]
      });
    }
  } catch (err) {
    console.error('Cobalt Fallback Error:', err.message);
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

// Port Server Lokal (Localhost)
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server aktif di http://localhost:${PORT}`);
  });
}

module.exports = app;
