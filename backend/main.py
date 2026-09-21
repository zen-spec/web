"""
VidSnap Backend API
FastAPI + yt-dlp untuk download YouTube & TikTok

Endpoint:
POST /api/info          → Ambil info video (title, thumbnail, formats)
POST /api/download-url  → Dapatkan URL download langsung (dari yt-dlp)
GET  /api/stream        → Proxy download file (WAJIB dipakai untuk TikTok,
                          karena CDN TikTok menolak hotlink langsung dari
                          browser user / 403 Forbidden Varnish)

Deploy ke Railway / Render / VPS
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import yt_dlp
import re
import os

# Referer wajib disertakan saat mengambil file dari CDN masing-masing
# platform, kalau tidak CDN (terutama TikTok) akan menolak dengan 403.
REFERER_MAP = {
    "youtube": "https://www.youtube.com/",
    "tiktok": "https://www.tiktok.com/",
}

DOWNLOAD_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)

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
        return bool(re.search(r'(youtube.com|youtu.be)', url, re.I))
    elif platform == "tiktok":
        return bool(re.search(r'(tiktok.com|vm.tiktok.com|vt.tiktok.com)', url, re.I))
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

def build_ydl_opts(platform: str, format_str: str = None) -> dict:
    """Konfigurasi yt-dlp dengan bypass bot/login YouTube untuk cloud server (Render/Railway)"""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "socket_timeout": 20,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
        }
    }

    if platform == "youtube":
        # Gunakan beberapa client (android, ios, tv, web) agar tidak mudah kena
        # blokir bot/login di IP Datacenter (Railway/Render). yt-dlp akan mencoba
        # client satu per satu sampai salah satu berhasil.
        opts["extractor_args"] = {
            "youtube": {
                "player_client": ["android", "ios", "tv", "web"],
                "player_skip": ["webpage"],
            }
        }
    elif platform == "tiktok":
        opts["format"] = "download_addr-0/best"
        
    if format_str:
        opts["format"] = format_str
        
    # Dukungan cookies jika user menyediakan cookies.txt atau environment variable
    cookie_path = os.path.join(os.path.dirname(__file__), "cookies.txt")
    if os.path.exists(cookie_path):
        opts["cookiefile"] = cookie_path
    elif os.environ.get("YOUTUBE_COOKIES"):
        temp_cookie = os.path.join(os.path.dirname(__file__), "temp_cookies.txt")
        try:
            with open(temp_cookie, "w", encoding="utf-8") as f:
                f.write(os.environ["YOUTUBE_COOKIES"])
            opts["cookiefile"] = temp_cookie
        except Exception:
            pass
            
    return opts

def explain_download_error(e: Exception) -> str:
    """Ubah error mentah yt-dlp jadi pesan yang jelas & actionable untuk user."""
    error_msg = str(e)
    if "Private video" in error_msg:
        return "Video bersifat private dan tidak dapat diakses."
    if "Video unavailable" in error_msg:
        return "Video tidak tersedia atau telah dihapus."
    if "This video is not available" in error_msg or "geo" in error_msg.lower():
        return "Video tidak tersedia di lokasi server (kemungkinan dibatasi wilayah/geo-blocked)."
    if "Sign in to confirm" in error_msg or "confirm you're not a bot" in error_msg or "Sign in" in error_msg:
        return (
            "YouTube meminta verifikasi login karena IP server ini terdeteksi sebagai bot "
            "(masalah umum di hosting cloud seperti Railway/Render, bukan soal video/link "
            "yang salah). Perbaikan: tambahkan cookies akun YouTube ke backend "
            "(file cookies.txt atau env var YOUTUBE_COOKIES) — lihat README."
        )
    if "Unable to extract" in error_msg or "unable to download" in error_msg.lower():
        return "YouTube mengubah struktur halaman mereka. Update yt-dlp ke versi terbaru (pip install -U yt-dlp)."
    return f"Gagal memproses video: {error_msg[:200]}"

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

    for preset in quality_presets:
        h = preset["height"]
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

    # Fallback jika format spesifik tidak ditemukan
    if len(result) <= 1:
        result = [
            {"format_id": "best[ext=mp4]/best", "label": "Kualitas Terbaik (MP4)", "ext": "mp4"},
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

    ydl_opts = build_ydl_opts(platform)

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
                response_data["formats"] = [
                    {"format_id": "best", "label": "HD (Tanpa Watermark)", "ext": "mp4"}
                ]

            return response_data

    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=422, detail=explain_download_error(e))
    except HTTPException:
        raise
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

    if platform == "tiktok":
        fmt = "download_addr-0/best"
    elif format_id == "bestaudio/best":
        fmt = "bestaudio/best"
    elif format_id in ["best", "best[ext=mp4]/best"]:
        fmt = "best[ext=mp4]/best"
    else:
        fmt = f"{format_id}[ext=mp4]/best[vcodec!=none][acodec!=none]/best[ext=mp4]/best"

    ydl_opts = build_ydl_opts(platform, format_str=fmt)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise HTTPException(status_code=404, detail="Video tidak ditemukan.")

            download_url = None
            if "url" in info:
                download_url = info["url"]
            elif "requested_formats" in info:
                fmts = info["requested_formats"]
                download_url = fmts[0].get("url") if fmts else None
            elif "formats" in info:
                # Prioritaskan format yang memiliki audio dan video sekaligus
                chosen = next(
                    (f for f in reversed(info["formats"])
                     if f.get("url") and f.get("vcodec") != "none" and f.get("acodec") != "none"),
                    None
                )
                if not chosen:
                    chosen = next(
                        (f for f in reversed(info["formats"])
                         if f.get("url") and f.get("ext") in ["mp4", "webm", "m4a", "mp3"]),
                        None
                    )
                download_url = chosen["url"] if chosen else None

            if not download_url:
                raise HTTPException(
                    status_code=422,
                    detail="Tidak dapat mendapatkan URL download langsung. Coba format lain."
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
        raise HTTPException(status_code=422, detail=explain_download_error(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)[:200]}")

# ----------------------------------------------------------
# PROXY DOWNLOAD (WAJIB untuk TikTok — hindari 403 dari CDN)
# Menggunakan yt-dlp internal opener untuk bypass TLS fingerprinting CDN.
# ----------------------------------------------------------
@app.get("/api/stream")
async def stream_download(media_url: str, platform: str = "youtube", filename: str = "video", ext: str = "mp4"):
    """
    Proxy download menggunakan internal opener yt-dlp.
    Ini menghindari 403 Forbidden karena menggunakan TLS fingerprint,
    headers, dan cookies yang SAMA PERSIS dengan yang digunakan yt-dlp
    saat mengambil info video. httpx sering diblokir oleh CDN TikTok
    karena TLS fingerprint-nya terdeteksi sebagai bot dari IP Datacenter.
    """
    safe_name = re.sub(r'[<>:"/\\|?*]', '', filename)[:80].strip() or "vidsnap"
    resp_headers = {"Content-Disposition": f'attachment; filename="{safe_name}.{ext}"'}

    ydl_opts = build_ydl_opts(platform)
    ydl_opts['skip_download'] = True  # Pastikan tidak mendownload ke disk server

    def iterfile():
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # ydl.urlopen() menggunakan urllib internal yt-dlp.
                # Ini SANGAT PENTING untuk TikTok karena menggunakan TLS fingerprint
                # yang sama persis dengan saat yt-dlp mengambil URL video.
                res = ydl.urlopen(media_url)
                
                while True:
                    chunk = res.read(65536)  # Baca per 64KB
                    if not chunk:
                        break
                    yield chunk
        except Exception as e:
            print(f"[Stream Error] {e}")
            yield b""  # Yield kosong jika terjadi error agar tidak crash

    return StreamingResponse(
        iterfile(),
        media_type="video/mp4" if ext == "mp4" else "audio/mpeg",
        headers=resp_headers
    )
