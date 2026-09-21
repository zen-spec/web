const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve folder public (untuk mode Localhost)
app.use(express.static(path.join(__dirname, '../public')));

// Helper: Deteksi Platform & Ekstrak ID
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
// 📥 ENDPOINT PROXY DOWNLOAD (Direct File Downloader)
// ============================================================
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL media tidak ditemukan');

    // Jika URL external helper, langsung redirect
    if (url.includes('y2mate') || url.includes('ssyoutube') || url.includes('cobalt.tools')) {
      return res.redirect(url);
    }

    const cleanFilename = (filename || 'saweria_download').replace(/[^a-zA-Z0-9._-]/g, '_');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: AbortSignal.timeout(10000)
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

// ------------------------------------------
// 1. TIKTOK HANDLER (TikWM Engine)
// ------------------------------------------
async function handleTikTok(url, res) {
  try {
    const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
    const json = await response.json();

    if (!json || json.code !== 0) {
      return res.status(400).json({ status: false, message: 'Gagal mengekstrak video TikTok. Pastikan video publik.' });
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
// 2. YOUTUBE HANDLER (Multi-Engine Anti-Fail)
// ------------------------------------------
async function handleYouTube(url, res) {
  const videoId = extractYTId(url);
  if (!videoId) {
    return res.status(400).json({ status: false, message: 'URL YouTube tidak valid!' });
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // 1. Ambil Metadata via Official YouTube oEmbed (100% Bebas Blokir IP Vercel)
  let title = `YouTube Video (${videoId})`;
  let author = 'YouTube Content Creator';

  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`);
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      if (oembedData.title) title = oembedData.title;
      if (oembedData.author_name) author = oembedData.author_name;
    }
  } catch (e) {}

  const downloads = [];

  // 2. Engine 1: Cobalt API
  try {
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      body: JSON.stringify({
        url: cleanUrl,
        videoQuality: '720',
        filenamePattern: 'basic'
      })
    });

    if (cobaltRes.ok) {
      const cobaltData = await cobaltRes.json();
      if (cobaltData && cobaltData.url) {
        downloads.push({
          type: 'video',
          quality: '720p HD MP4',
          url: cobaltData.url
        });
      }
    }
  } catch (err) {}

  // 3. Engine 2: Piped API Instances (jika Cobalt gagal/empty)
  if (downloads.length === 0) {
    const pipedInstances = [
      `https://pipedapi.kavin.rocks/streams/${videoId}`,
      `https://api.piped.yt/streams/${videoId}`,
      `https://pipedapi.tokhmi.xyz/streams/${videoId}`
    ];

    for (const endpoint of pipedInstances) {
      try {
        const pipedRes = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
        if (pipedRes.ok) {
          const pipedData = await pipedRes.json();
          if (pipedData && pipedData.videoStreams) {
            const mp4Streams = pipedData.videoStreams.filter(s => s.mimeType && s.mimeType.includes('video/mp4'));
            const bestStream = mp4Streams.find(s => s.quality === '720p') || mp4Streams[0] || pipedData.videoStreams[0];
            
            if (bestStream && bestStream.url) {
              downloads.push({
                type: 'video',
                quality: `${bestStream.quality || '720p'} MP4`,
                url: bestStream.url
              });
            }

            if (pipedData.audioStreams && pipedData.audioStreams.length > 0) {
              const bestAudio = pipedData.audioStreams.find(a => a.mimeType && a.mimeType.includes('audio/mp4')) || pipedData.audioStreams[0];
              if (bestAudio && bestAudio.url) {
                downloads.push({
                  type: 'audio',
                  quality: 'Audio MP3/M4A',
                  url: bestAudio.url
                });
              }
            }
            if (downloads.length > 0) break;
          }
        }
      } catch (e) {}
    }
  }

  // 4. Engine 3: Invidious API (Fallback Cadangan)
  if (downloads.length === 0) {
    const invidiousInstances = [
      `https://inv.tux.pizza/api/v1/videos/${videoId}`,
      `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`
    ];

    for (const invEndpoint of invidiousInstances) {
      try {
        const invRes = await fetch(invEndpoint, { signal: AbortSignal.timeout(3000) });
        if (invRes.ok) {
          const invData = await invRes.json();
          if (invData && invData.formatStreams && invData.formatStreams.length > 0) {
            const mp4 = invData.formatStreams.find(s => s.container === 'mp4') || invData.formatStreams[0];
            if (mp4 && mp4.url) {
              downloads.push({
                type: 'video',
                quality: `${mp4.qualityLabel || '720p'} MP4`,
                url: mp4.url
              });
              break;
            }
          }
        }
      } catch (e) {}
    }
  }

  // 5. Engine 4: Reliable Direct Link Fallback (Bypass Blokir IP Vercel)
  if (downloads.length === 0) {
    downloads.push(
      {
        type: 'video',
        quality: '720p MP4 (Fast Server)',
        url: `https://ssyoutube.com/watch?v=${videoId}`
      },
      {
        type: 'audio',
        quality: 'Audio MP3 (Fast Server)',
        url: `https://www.y2mate.com/youtube/${videoId}`
      }
    );
  }

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
  app.listen(PORT, () => console.log(`🚀 Server aktif di http://localhost:${PORT}`));
}

module.exports = app;
