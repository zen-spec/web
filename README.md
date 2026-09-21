# 🎬 VidSnap — YouTube & TikTok Downloader

Website download video YouTube dan TikTok gratis, tanpa watermark, dengan pilihan kualitas. **Frontend dan Backend kini bersatu di Vercel (1 repository, 1 klik deploy).**

## 📁 Struktur Project

```
vidsnap/
├── api/
│   └── index.py        ← FastAPI Serverless Function untuk Vercel
├── index.html          ← Halaman utama frontend
├── css/
│   └── style.css       ← Styling modern dark theme
├── js/
│   └── app.js          ← Logika frontend (otomatis panggil /api/...)
├── requirements.txt    ← Dependencies Python untuk Vercel
├── vercel.json         ← Konfigurasi rewrite Vercel
└── README.md
```

---

## ⚡ Deploy ke Vercel (Frontend & Backend Bersatu)

1. **Push folder ini ke repository GitHub** Anda.
2. Buka [vercel.com](https://vercel.com) dan login/daftar.
3. Klik **"Add New..."** → **"Project"** → Pilih repository GitHub Anda.
4. Pada pengaturan project:
   - **Framework Preset**: Pilih `Other`.
   - **Root Directory**: `./` (biarkan default).
5. Klik **"Deploy"**! 🚀
6. Selesai! Vercel akan otomatis menyajikan file HTML/CSS/JS dan menjalankan Python Serverless Function di `/api/...` dalam 1 domain tanpa ribet CORS ataupun masalah cold start.

---

## 🔧 Fitur

| Fitur | Status |
|-------|--------|
| Download YouTube (144p-1080p) | ✅ |
| Download YouTube Audio (MP3) | ✅ |
| Download TikTok tanpa watermark | ✅ |
| Auto-deteksi platform dari URL | ✅ |
| Progress bar animasi | ✅ |
| Dark mode premium UI | ✅ |
| Mobile responsive | ✅ |
| FAQ accordion | ✅ |

---

## ⚙️ API Endpoints

### `POST /api/info`
Ambil informasi video.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "platform": "youtube"
}
```

**Response:**
```json
{
  "platform": "youtube",
  "title": "Rick Astley - Never Gonna Give You Up",
  "thumbnail": "https://...",
  "duration": 213,
  "uploader": "Rick Astley",
  "formats": [
    { "format_id": "137", "label": "1080p Full HD", "ext": "mp4" },
    { "format_id": "136", "label": "720p HD", "ext": "mp4" },
    ...
  ]
}
```

### `POST /api/download-url`
Dapatkan URL download langsung.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "format_id": "137",
  "platform": "youtube"
}
```

**Response:**
```json
{
  "download_url": "https://...",
  "title": "Video Title",
  "ext": "mp4"
}
```

---

## 📋 Persyaratan

- **Backend:** Python 3.9+, pip
- **Frontend:** Browser modern (Chrome, Firefox, Edge, Safari)
- **yt-dlp** (auto-install via pip)

---

## ⚠️ Disclaimer

Website ini dibuat untuk keperluan pribadi. Hormati hak cipta kreator konten. Jangan gunakan untuk mendistribusikan ulang konten yang dilindungi hak cipta.

---

Made with ❤️ using FastAPI + yt-dlp
