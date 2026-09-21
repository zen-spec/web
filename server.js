const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const tiktok = require('tiktok-scraper');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Endpoint YouTube
app.post('/api/youtube', async (req, res) => {
  try {
    const { url } = req.body;
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'URL YouTube tidak valid' });
    }

    const info = await ytdl.getInfo(url);
    const formats = info.formats
      .filter(f => f.hasVideo && f.hasAudio)
      .map(f => ({
        quality: f.qualityLabel,
        url: f.url,
        mimeType: f.mimeType,
        itag: f.itag
      }));

    // Audio only
    const audio = info.formats
      .filter(f => !f.hasVideo && f.hasAudio)
      .map(f => ({
        quality: f.audioBitrate + 'kbps',
        url: f.url,
        mimeType: f.mimeType
      }));

    res.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails.pop().url,
      duration: info.videoDetails.lengthSeconds,
      author: info.videoDetails.author.name,
      videoFormats: formats.slice(0, 5),
      audioFormats: audio.slice(0, 3)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint TikTok
app.post('/api/tiktok', async (req, res) => {
  try {
    const { url } = req.body;
    const videoMeta = await tiktok.getVideoMeta(url, {});
    
    res.json({
      title: videoMeta.collector[0].text,
      thumbnail: videoMeta.collector[0].imageUrl,
      author: videoMeta.collector[0].authorMeta.name,
      videoUrl: videoMeta.collector[0].videoUrl,
      videoUrlNoWatermark: videoMeta.collector[0].videoUrlNoWaterMark,
      music: videoMeta.collector[0].musicMeta
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy download (agar tidak kena CORS)
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    const response = await fetch(url);
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'video.mp4'}"`);
    res.setHeader('Content-Type', response.headers.get('content-type'));
    
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
app.listen(PORT, () => console.log(`✅ Server jalan di http://localhost:${PORT}`));
