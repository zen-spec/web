const express = require('express');
const cors = require('cors');
const TikTokScraper = require('tiktok-scraper');
const { YouTubeScraper } = require('@vreden/youtube_scraper');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const ytScraper = new YouTubeScraper();

// ==========================================
// 1. ENDPOINT TIKTOK
// ==========================================
app.post('/api/tiktok', async (req, res) => {
    try {
        const { url } = req.body;
        
        // Mengambil metadata video TikTok
        const videoMeta = await TikTokScraper.getVideoMeta(url, { hdVideo: true });
        
        if (!videoMeta || !videoMeta.collector || videoMeta.collector.length === 0) {
            return res.status(400).json({ error: 'Video tidak ditemukan atau link tidak valid.' });
        }

        const data = videoMeta.collector[0];
        
        res.json({
            success: true,
            data: {
                platform: 'tiktok',
                title: data.text || 'TikTok Video',
                author: data.authorMeta?.name || 'Unknown',
                thumbnail: data.cover,
                // Prioritaskan link tanpa watermark
                videoNoWatermark: data.videoUrlNoWaterMark || data.videoUrl,
                videoWithWatermark: data.videoUrl,
                music: data.musicUrl
            }
        });
    } catch (error) {
        console.error('TikTok Error:', error.message);
        res.status(500).json({ error: 'Gagal mengambil data TikTok. TikTok mungkin memblokir request ini.' });
    }
});

// ==========================================
// 2. ENDPOINT YOUTUBE
// ==========================================
app.post('/api/youtube', async (req, res) => {
    try {
        const { url } = req.body;
        
        const video = await ytScraper.getVideo(url);
        
        if (!video) {
            return res.status(400).json({ error: 'Video YouTube tidak ditemukan.' });
        }

        // Filter format yang tersedia (MP4 Video & MP4 Audio)
        const formats = video.formats.filter(f => 
            f.mimeType && (f.mimeType.includes('video/mp4') || f.mimeType.includes('audio/mp4'))
        );

        // Urutkan berdasarkan bitrate (kualitas tertinggi di atas)
        formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        const cleanFormats = formats.map(f => ({
            quality: f.qualityLabel || (f.mimeType.includes('audio') ? 'Audio MP3' : 'Video'),
            url: f.url,
            type: f.mimeType.includes('audio') ? 'audio' : 'video',
            size: f.contentLength ? (f.contentLength / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'
        }));

        res.json({
            success: true,
            data: {
                platform: 'youtube',
                title: video.title,
                thumbnail: video.thumbnails?.[0]?.url || '',
                duration: video.duration,
                formats: cleanFormats
            }
        });
    } catch (error) {
        console.error('YouTube Error:', error.message);
        res.status(500).json({ error: 'Gagal mengambil data YouTube.' });
    }
});

// ==========================================
// 3. ENDPOINT PROXY DOWNLOAD (PENTING!)
// ==========================================
// YouTube/TikTok memblokir download langsung dari browser (CORS). 
// Endpoint ini bertindak sebagai perantara agar file bisa terdownload dengan benar.
app.get('/api/download', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send('URL diperlukan');

        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });

        res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        
        response.data.pipe(res);
    } catch (error) {
        console.error('Download Proxy Error:', error.message);
        res.status(500).send('Gagal mendownload file. Link mungkin sudah kedaluwarsa.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
