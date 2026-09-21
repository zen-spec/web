"""
VidSnap Backend API
===================
FastAPI + yt-dlp untuk download YouTube & TikTok

Endpoint:
  POST /api/info          → Ambil info video (title, thumbnail, formats)
  POST /api/download-url  → Dapatkan URL download langsung

Deploy ke Railway / Render / VPS
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
import re
import os

# ============================================================
# APP SETUP
# ============================================================
app = FastAPI(
    title="VidSnap API",
    description="YouTube & TikTok Downloader API",
    version="1.0.0"
)

# CORS — izinkan semua origin (bisa diperketat setelah deploy)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# MODELS
# ============================================================
class VideoInfoRequest(BaseModel):
    url: str
    platform: str = "youtube"

class DownloadUrlRequest(BaseModel):
    url: str
    format_id: str = "best"
    platform: str = "youtube"

# ============================================================
# HELPERS
# ============================================================
def is_valid_url(url: str, platform: str) -> bool:
    if platform == "youtube":
        return bool(re.search(r'(youtube\.com|youtu\.be)', url, re.I))
    elif platform == "tiktok":
        return bool(re.search(r'(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)', url, re.I))
    return False

def format_duration(seconds: int) -> str:
    if not seconds:
        return "-"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

def get_youtube_formats(info: dict) -> list:
    """Ekstrak format YouTube yang tersedia"""
    formats_raw = info.get("formats", [])
    seen = set()
    result = []

    # Preset kualitas yang kita tawarkan
    quality_presets = [
        {"label": "1080p Full HD", "height": 1080, "ext": "mp4"},
        {"label": "720p HD", "height": 720, "ext": "mp4"},
        {"label": "480p", "height": 480, "ext": "mp4"},
        {"label": "360p", "height": 360, "ext": "mp4"},
        {"label": "144p", "height": 144, "ext": "mp4"},
    ]

    available_heights = set()
    for f in formats_raw:
        if f.get("height"):
            available_heights.add(f.get("height"))

    for preset in quality_presets:
        h = preset["height"]
        # Cari format mendekati height ini
        best_match = None
        for f in formats_raw:
            fh = f.get("height") or 0
            if abs(fh - h) <= 50 and f.get("ext") in ["mp4", "webm"]:
                if best_match is None or (f.get("filesize") or 0) > (best_match.get("filesize") or 0):
                    best_match = f

        if best_match and best_match.get("format_id") not in seen:
            seen.add(best_match["format_id"])
            result.append({
                "format_id": best_match["format_id"],
                "label": preset["label"],
                "ext": "mp4",
                "height": h,
                "filesize": best_match.get("filesize")
            })

    # Tambahkan opsi audio MP3
    result.append({
        "format_id": "bestaudio/best",
        "label": "🎵 MP3 Audio",
        "ext": "mp3",
    })

    # Fallback jika tidak ada format spesifik
    if len(result) <= 1:
        result = [
            {"format_id": "best[ext=mp4]/best", "label": "Kualitas Terbaik", "ext": "mp4"},
            {"format_id": "bestaudio/best", "label": "🎵 MP3 Audio", "ext": "mp3"},
        ]

    return result

# ============================================================
# ROUTES
# ============================================================
@app.get("/")
def root():
    return {"status": "ok", "message": "VidSnap API is running 🚀"}

@app.get("/health")
def health():
    return {"status": "healthy"}

# ----------------------------------------------------------
# GET VIDEO INFO
# ----------------------------------------------------------
@app.post("/api/info")
async def get_video_info(req: VideoInfoRequest):
    url = req.url.strip()
    platform = req.platform.lower()

    if not is_valid_url(url, platform):
        raise HTTPException(
            status_code=400,
            detail=f"URL tidak valid untuk platform {platform}."
        )

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
    }

    # TikTok: gunakan format tanpa watermark
    if platform == "tiktok":
        ydl_opts["format"] = "download_addr-0"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            if not info:
                raise HTTPException(status_code=404, detail="Video tidak ditemukan.")

            response_data = {
                "platform": platform,
                "title": info.get("title", ""),
                "thumbnail": info.get("thumbnail", ""),
                "duration": info.get("duration"),
                "uploader": info.get("uploader") or info.get("channel") or info.get("creator", ""),
                "view_count": info.get("view_count"),
                "like_count": info.get("like_count"),
                "formats": []
            }

            if platform == "youtube":
                response_data["formats"] = get_youtube_formats(info)
            else:
                # TikTok — langsung format terbaik
                response_data["formats"] = [
                    {"format_id": "best", "label": "HD (Tanpa Watermark)", "ext": "mp4"}
                ]

            return response_data

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        if "Private video" in error_msg:
            detail = "Video bersifat private dan tidak dapat diakses."
        elif "Video unavailable" in error_msg:
            detail = "Video tidak tersedia atau telah dihapus."
        elif "Sign in" in error_msg:
            detail = "Video memerlukan login. Coba link lain."
        else:
            detail = f"Gagal mengambil info video: {error_msg[:200]}"
        raise HTTPException(status_code=422, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)[:200]}")

# ----------------------------------------------------------
# GET DOWNLOAD URL
# ----------------------------------------------------------
@app.post("/api/download-url")
async def get_download_url(req: DownloadUrlRequest):
    url = req.url.strip()
    format_id = req.format_id
    platform = req.platform.lower()

    if not is_valid_url(url, platform):
        raise HTTPException(status_code=400, detail="URL tidak valid.")

    # Pilih format berdasarkan platform dan format_id
    if platform == "tiktok":
        fmt = "best"
    elif format_id == "bestaudio/best":
        fmt = "bestaudio/best"
    elif format_id in ["best", "best[ext=mp4]/best"]:
        fmt = "best[ext=mp4]/best"
    else:
        # Merge video + audio jika perlu
        fmt = f"{format_id}+bestaudio[ext=m4a]/bestaudio/{format_id}/best[ext=mp4]/best"

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "format": fmt,
    }

    # TikTok khusus: coba tanpa watermark
    if platform == "tiktok":
        ydl_opts["format"] = "download_addr-0/best"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            if not info:
                raise HTTPException(status_code=404, detail="Video tidak ditemukan.")

            # Dapatkan URL download langsung
            download_url = None

            if "url" in info:
                download_url = info["url"]
            elif "requested_formats" in info:
                # Untuk video+audio merged, ambil format video utama
                # (browser akan menggunakan URL langsung)
                fmts = info["requested_formats"]
                download_url = fmts[0].get("url") if fmts else None
            elif "formats" in info:
                # Pilih format terbaik
                chosen = next(
                    (f for f in reversed(info["formats"])
                     if f.get("url") and f.get("ext") in ["mp4", "webm", "m4a", "mp3"]),
                    None
                )
                download_url = chosen["url"] if chosen else None

            if not download_url:
                raise HTTPException(
                    status_code=422,
                    detail="Tidak dapat mendapatkan URL download. Coba format lain."
                )

            ext = "mp4"
            if format_id == "bestaudio/best":
                ext = "mp3"
            elif info.get("ext"):
                ext = info.get("ext", "mp4")

            return {
                "download_url": download_url,
                "title": info.get("title", "video"),
                "ext": ext,
                "filesize": info.get("filesize") or info.get("filesize_approx"),
            }

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        if "Private video" in error_msg:
            detail = "Video bersifat private."
        elif "Video unavailable" in error_msg:
            detail = "Video tidak tersedia."
        else:
            detail = f"Gagal memproses: {error_msg[:200]}"
        raise HTTPException(status_code=422, detail=detail)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)[:200]}")
