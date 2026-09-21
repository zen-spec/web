const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve folder public (untuk mode Localhost)
app.use(express.static(path.join(__dirname, '../public')));

// Helper: Deteksi Platform & ID Video
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
// 1. YOUTUBE NATIVE SELF-SCRAPER (InnerTube API Engine)
// ============================================================
async function scrapeYouTubeInnerTube(videoId) {
  const clients = [
    {
      clientName: 'ANDROID',
      clientVersion: '19.02.39',
      androidSdkVersion: 31
    },
    {
      clientName: 'IOS',
      clientVersion: '19.02.1',
      deviceModel: 'iPhone14,3',
      osName: 'iPhone',
      osVersion: '17.2.0'
    }
  ];

  for (const clientConfig of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.youtube/19.02.39 (Linux; U; Android 12)'
        },
        body: JSON.stringify({
          videoId: videoId,
          context: {
            client: {
              ...clientConfig,
              hl: 'id',
              gl: 'ID'
            }
          }
        })
      });

      if (!res.ok) continue;

      const data = await res.json();
      const videoDetails = data.videoDetails || {};
      const streamingData = data.streamingData || {};

      const allFormats = [
        ...(streamingData.formats || []),
        ...(streamingData.adaptiveFormats || [])
      ];

      // Ambil format yang memiliki URL langsung (tanpa signature cipher)
      const directFormats = allFormats.filter(f => f.url);

      if (directFormats.length > 0) {
        return {
          title: videoDetails.title || `YouTube Video (${videoId})`,
          author: videoDetails.author || 'YouTube Channel',
          duration: videoDetails.lengthSeconds 
            ? `${Math.floor(videoDetails.lengthSeconds / 60)}m ${videoDetails.lengthSeconds % 60}s` 
            : 'HD',
          thumbnail: videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          formats: directFormats
        };
      }
    } catch (e) {
      console.error(`InnerTube ${clientConfig.clientName} Error:`, e.message);
    }
  }

  return null;
}

async function handleYouTube(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  const scraped = await scrapeYouTubeInnerTube(videoId);

  if (!scraped) {
    return res.status(500).json({
      status: false,
      message: 'Gagal mengekstrak video YouTube. Silakan coba link lain atau beberapa saat lagi.'
    });
  }

  const downloads = [];

  // Filter Format Video (MP4 Muxed / Direct Stream)
  const videoStreams = scraped.formats.filter(f => f.mimeType && f.mimeType.includes('video/mp4'));
  const addedQualities = new Set();

  videoStreams.forEach(f => {
    const quality = f.qualityLabel || '720p';
    if (!addedQualities.has(quality)) {
      addedQualities.add(quality);
      downloads.push({
        type: 'video',
        quality: `${quality} MP4`,
        url: f.url
      });
    }
  });

  // Jika tidak ada MP4 Muxed, ambil video stream terbaik yang ada
  if (downloads.length === 0) {
    const fallbackVideo = scraped.formats.find(f => f.mimeType && f.mimeType.includes('video'));
    if (fallbackVideo) {
      downloads.push({
        type: 'video',
        quality: `${fallbackVideo.qualityLabel || '720p'} MP4`,
        url: fallbackVideo.url
      });
    }
  }

  // Filter Format Audio Only (MP3/M4A)
  const audioStreams = scraped.formats.filter(f => f.mimeType && f.mimeType.includes('audio'));
  const bestAudio = audioStreams.find(f => f.mimeType.includes('audio/mp4')) || audioStreams[0];

  if (bestAudio) {
    downloads.push({
      type: 'audio',
      quality: 'Audio Original (M4A/MP3)',
      url: bestAudio.url
    });
  }

  return res.json({
    status: true,
    platform: 'youtube',
    title: scraped.title,
    author: scraped.author,
    duration: scraped.duration,
    thumbnail: scraped.thumbnail,
    downloads
  });
}

// ============================================================
// 2. TIKTOK SELF-SCRAPER
// ============================================================
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

// ============================================================
// 3. INTERNAL PROXY DOWNLOADER (Paksa Langsung Unduh File)
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
