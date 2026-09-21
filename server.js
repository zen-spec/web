const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const tiktok = require('@tobyg74/tiktok-api-dl');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ YOUTUBE ============
app.post('/api/youtube', async (req, res) => {
  try {
    const { url } = req.body;
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'URL YouTube tidak valid' });
    }

    const info = await ytdl.getInfo(url);

    // Video + audio
    const videoFormats = info.formats
      .filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4')
      .map(f => ({
        quality: f.qualityLabel || 'unknown',
        url: f.url,
        itag: f.itag
      }))
      .filter((v, i, arr) => arr.findIndex(x => x.quality === v.quality) === i)
      .slice(0, 5);

    // Audio saja
    const audioFormats = info.formats
      .filter(f => !f.hasVideo && f.hasAudio)
      .map(f => ({
        quality: (f.audioBitrate || 128) + 'kbps',
        url: f.url
      }))
      .filter((v, i, arr) => arr.findIndex(x => x.quality === v.quality) === i)
      .slice(0, 3);

    res.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails.pop().url,
      duration: info.videoDetails.lengthSeconds,
      author: info.videoDetails.author.name,
      videoFormats,
      audioFormats
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal ambil video: ' + err.message });
  }
});

// ============ TIKTOK ============
app.post('/api/tiktok', async (req, res) => {
  try {
    const { url } = req.body;
    const result = await tiktok.Downloader(url, { version: 'v1' });

    if (result.status !== 'success') {
      return res.status(400).json({ error: 'Gagal ambil video TikTok' });
    }

    const data = result.result;
    res.json({
      title: data.desc || 'TikTok Video',
      thumbnail: data.cover?.[0] || data.cover,
      author: data.author?.nickname || data.author?.unique_id || 'Unknown',
      videoUrl: data.video?.playAddr?.[0] || data.video?.playAddr,
      videoUrlNoWatermark: data.video?.downloadAddr?.[0] || data.video?.downloadAddr,
      music: data.music
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal ambil video: ' + err.message });
  }
});

// ============ PROXY DOWNLOAD ============
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'video.mp4'}"`);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');

    const reader = response.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) return res.end();
      res.write(Buffer.from(value));
      return pump();
    };
    await pump();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Server jalan di: http://localhost:${PORT}\n`);
});
