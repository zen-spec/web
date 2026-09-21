# 🎬 VidSnap — YouTube & TikTok Downloader

Website download video YouTube dan TikTok gratis, tanpa watermark, dengan pilihan kualitas.

## 📁 Struktur Project

```
vidsnap/
├── index.html          ← Halaman utama
├── css/
│   └── style.css       ← Styling modern dark theme
├── js/
│   └── app.js          ← Logika frontend
├── backend/
│   ├── main.py         ← FastAPI backend server
│   ├── requirements.txt
│   ├── railway.json    ← Config deploy Railway
│   └── .env.example
└── README.md
```

---

## 🚀 Cara Jalankan (Development)

### 1. Jalankan Backend (Python)

```bash
# Masuk ke folder backend
cd backend

# Install dependencies
pip install -r requirements.txt

# Jalankan server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend akan berjalan di: `http://localhost:8000`

### 2. Buka Frontend

Cukup buka file `index.html` langsung di browser, atau gunakan Live Server di VS Code.

> **Catatan:** Pastikan backend sudah berjalan sebelum mencoba download video!

---

## 🌐 Deploy ke Internet

### Deploy Backend → Railway (Gratis)

1. Daftar di [railway.app](https://railway.app)
2. Buat project baru → "Deploy from GitHub"
3. Set **Root Directory** ke `backend/`
4. Railway akan otomatis mendeteksi Python dan install dependencies
5. Salin URL backend yang diberikan (contoh: `https://vidsnap-backend.up.railway.app`)

### Deploy Frontend → Vercel (Gratis)

1. Daftar di [vercel.com](https://vercel.com)
2. Upload folder root project (yang ada `index.html`)
3. Vercel akan langsung deploy

### Hubungkan Frontend dengan Backend

Setelah deploy backend, buka file `js/app.js` dan ganti baris:

```js
// Sebelum (localhost):
const API_BASE_URL = 'http://localhost:8000';

// Sesudah (URL Railway kamu):
const API_BASE_URL = 'https://vidsnap-backend.up.railway.app';
```

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
