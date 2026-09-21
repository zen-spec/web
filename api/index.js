const express = require('express');
const cors = require('cors');
const Tiktok = require('@maxinminax/tiktok-api-dl');
const yt = require('@vreden/youtube_scraper');

const app = express();

// Konfigurasi CORS agar frontend dapat mengakses API
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  })
);

app.use(express.json());

// Helper: Deteksi Platform
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return null;
}

// Handler YouTube
async function handleYouTube(url, res) {
  try {
    const [meta, mp4Data, mp3Data] = await Promise.allSettled([
      yt.metadata(url),
      yt.ytmp4(url, 720),
      yt.ytmp3(url, 320)
    ]);

    const metadata = meta.status === 'fulfilled' ? meta.value : null;
    const mp4 = mp4Data.status === 'fulfilled' ? mp4Data.value : null;
    const mp3 = mp3Data.status === 'fulfilled' ? mp3Data.value : null;

    if (!metadata && !mp4 && !mp3) {
      return res.status(400).json({ status: false, message: 'Gagal mengambil data dari YouTube.' });
    }

    const responseData = {
      status: true,
      platform: 'youtube',
      title: metadata?.title || mp4?.metadata?.title || 'YouTube Video',
      author: metadata?.author?.name || mp4?.metadata?.author || 'Unknown Uploader',
      duration: metadata?.duration || 'N/A',
      thumbnail: metadata?.thumbnail || mp4?.metadata?.thumbnails?.[0]?.url || '',
      downloads: []
    };

    if (mp4 && mp4.download?.url) {
      responseData.downloads.push({
        type: 'video',
        quality: `${mp4.download.quality || '720p'} MP4`,
        url: mp4.download.url
      });
    }

    if (mp3 && mp3.download?.url) {
      responseData.downloads.push({
        type: 'audio',
        quality: `${mp3.download.quality || '320kbps'} MP3`,
        url: mp3.download.url
      });
    }

    return res.json(responseData);
  } catch (err) {
    console.error('YouTube Error:', err);
    return res.status(500).json({ status: false, message: 'Gagal memproses video YouTube.' });
  }
}

// Handler TikTok
async function handleTikTok(url, res) {
  try {
    const result = await Tiktok.Downloader(url, { version: 'v1' });

    if (!result || result.status === 'error' || !result.result) {
      return res.status(400).json({ status: false, message: 'Gagal mengekstrak video TikTok.' });
    }

    const data = result.result;

    const responseData = {
      status: true,
      platform: 'tiktok',
      title: data.desc || data.description || 'TikTok Video',
      author: data.author?.nickname || data.author?.unique_id || 'TikTok User',
      duration: data.duration ? `${data.duration}s` : 'N/A',
      thumbnail: data.cover || data.origin_cover || '',
      downloads: []
    };

    if (data.video1 || data.play) {
      responseData.downloads.push({
        type: 'video',
        quality: 'No Watermark (HD)',
        url: data.video1 || data.play
      });
    }

    if (data.wmplay || data.watermark) {
      responseData.downloads.push({
        type: 'video',
        quality: 'With Watermark',
        url: data.wmplay || data.watermark
      });
    }

    if (data.music || data.music_info?.play) {
      responseData.downloads.push({
        type: 'audio',
        quality: 'Audio Original (MP3)',
        url: data.music || data.music_info?.play
      });
    }

    return res.json(responseData);
  } catch (err) {
    console.error('TikTok Error:', err);
    return res.status(500).json({ status: false, message: 'Gagal memproses video TikTok.' });
  }
}

// Endpoint Utama Fetch
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

// Root & Health check
app.get('*', (req, res) => {
  res.json({ status: 'online', message: 'Saweria Downloader Vercel Backend Ready' });
});

// Export untuk Vercel Serverless Function
module.exports = app;
