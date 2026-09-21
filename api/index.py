"""
VidSnap API - Vercel Serverless Function
========================================
FastAPI + TikWM (TikTok 100% Free Anti-403) + yt-dlp (YouTube)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import yt_dlp
import httpx
import re
import os
import tempfile

REFERER_MAP = {
    "youtube": "https://www.youtube.com/",
    "tiktok": "https://www.tiktok.com/",
}
DOWNLOAD_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
)

app = FastAPI(
    title="VidSnap API",
    description="YouTube & TikTok Downloader API on Vercel",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VideoInfoRequest(BaseModel):
    url: str
    platform: str = "youtube"

class DownloadUrlRequest(BaseModel):
    url: str
    format_id: str = "best"
    platform: str = "youtube"

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

def make_tikwm_url(url_or_path: str) -> str:
    if not url_or_path:
        return ""
    if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
        return url_or_path
    return f"https://www.tikwm.com{url_or_path}"

async def fetch_tiktok_tikwm(url: str) -> dict | None:
    """Ambil data TikTok bebas watermark & anti-403 dari TikWM API gratis."""
    canonical_url = url
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            if "vt.tiktok.com" in url or "vm.tiktok.com" in url:
                try:
                    head_res = await client.head(url, headers={"User-Agent": DOWNLOAD_USER_AGENT})
                    if str(head_res.url) and "tiktok.com" in str(head_res.url):
                        canonical_url = str(head_res.url)
                except Exception:
                    pass

            resp = await client.post(
                "https://www.tikwm.com/api/",
                data={"url": canonical_url, "count": 12, "cursor": 0, "web": 1, "hd": 1},
                headers={
                    "User-Agent": DOWNLOAD_USER_AGENT,
                    "Accept": "application/json",
                }
            )
            if resp.status_code == 200:
                body = resp.json()
                if body.get("code") == 0 and body.get("data"):
                    return body["data"]
    except Exception as e:
        print(f"[TikWM] Fetch error: {e}")
    return None

def build_ydl_opts(platform: str, format_str: str = None) -> dict:
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
        opts["extractor_args"] = {
            "youtube": {
                "player_client": ["android", "ios", "tv", "web"],
                "player_skip": ["webpage"],
            }
        }
    elif platform == "tiktok":
        opts["format"] = "best[ext=mp4]/best"

    if format_str:
        opts["format"] = format_str

    # Di Vercel Serverless (AWS Lambda), direktori /var/task bersifat READ-ONLY.
    # yt-dlp selalu mencoba menulis balik update sesi/cookies ke cookiefile.
    # Maka, salin/tulis cookies ke folder /tmp (yang 100% writable di serverless).
    writable_cookie = os.path.join(tempfile.gettempdir(), "vidsnap_cookies.txt")

    source_cookie = os.path.join(os.path.dirname(__file__), "cookies.txt")
    if os.path.exists(source_cookie):
        try:
            with open(source_cookie, "r", encoding="utf-8") as src, open(writable_cookie, "w", encoding="utf-8") as dst:
                dst.write(src.read())
            opts["cookiefile"] = writable_cookie
        except Exception as e:
            print(f"[Cookies] Gagal copy cookies ke /tmp: {e}")
    elif os.environ.get("YOUTUBE_COOKIES"):
        try:
            with open(writable_cookie, "w", encoding="utf-8") as f:
                f.write(os.environ["YOUTUBE_COOKIES"])
            opts["cookiefile"] = writable_cookie
        except Exception as e:
            print(f"[Cookies] Gagal tulis YOUTUBE_COOKIES ke /tmp: {e}")

    return opts

def explain_download_error(e: Exception) -> str:
    error_msg = str(e)
    if "Private video" in error_msg:
        return "Video bersifat private dan tidak dapat diakses."
    if "Video unavailable" in error_msg:
        return "Video tidak tersedia atau telah dihapus."
    if "This video is not available" in error_msg or "geo" in error_msg.lower():
        return "Video tidak tersedia di lokasi server (kemungkinan dibatasi wilayah/geo-blocked)."
    if "Sign in to confirm" in error_msg or "confirm you're not a bot" in error_msg or "Sign in" in error_msg:
        return (
            "YouTube mendeteksi server cloud sebagai bot dan meminta verifikasi. "
            "Gunakan cookies YouTube (env var YOUTUBE_COOKIES) atau coba video lain."
        )
    if "Unable to extract" in error_msg or "unable to download" in error_msg.lower():
        return "YouTube mengubah struktur halaman. Coba beberapa saat lagi."
    return f"Gagal memproses video: {error_msg[:200]}"

def get_youtube_formats(info: dict) -> list:
    formats_raw = info.get("formats", [])
    seen = set()
    result = []

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

    result.append({
        "format_id": "bestaudio/best",
        "label": "🎵 MP3 Audio",
        "ext": "mp3",
    })

    if len(result) <= 1:
        result = [
            {"format_id": "best[ext=mp4]/best", "label": "Kualitas Terbaik (MP4)", "ext": "mp4"},
            {"format_id": "bestaudio/best", "label": "🎵 MP3 Audio", "ext": "mp3"},
        ]

    return result

# ============================================================
# ROUTES (Mendukung / dan /api/...)
# ============================================================
@app.get("/")
@app.get("/api")
def root():
    return {"status": "ok", "message": "VidSnap API is running on Vercel 🚀"}

@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "healthy"}

@app.post("/api/info")
async def get_video_info(req: VideoInfoRequest):
    url = req.url.strip()
    platform = req.platform.lower()

    if not is_valid_url(url, platform):
        raise HTTPException(
            status_code=400,
            detail=f"URL tidak valid untuk platform {platform}."
        )

    # Prioritaskan TikWM Scraper API untuk TikTok (100% gratis, anti-403, bebas watermark)
    if platform == "tiktok":
        tikwm_data = await fetch_tiktok_tikwm(url)
        if tikwm_data:
            cover = make_tikwm_url(tikwm_data.get("cover") or tikwm_data.get("origin_cover", ""))
            author = tikwm_data.get("author", {})
            uploader = author.get("nickname") or author.get("unique_id", "")
            duration = int(tikwm_data.get("duration") or 0)
            title = tikwm_data.get("title") or "TikTok Video"

            formats = [
                {"format_id": "best", "label": "Full HD (Tanpa Watermark)", "ext": "mp4"},
            ]
            if tikwm_data.get("wmplay"):
                formats.append({"format_id": "watermark", "label": "SD (Dengan Watermark)", "ext": "mp4"})
            if tikwm_data.get("music"):
                formats.append({"format_id": "bestaudio/best", "label": "🎵 MP3 Audio", "ext": "mp3"})

            return {
                "platform": "tiktok",
                "title": title,
                "thumbnail": cover,
                "duration": duration,
                "uploader": uploader,
                "view_count": tikwm_data.get("play_count"),
                "like_count": tikwm_data.get("digg_count"),
                "formats": formats
            }

    # Fallback / YouTube: gunakan yt-dlp
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

@app.post("/api/download-url")
async def get_download_url(req: DownloadUrlRequest):
    url = req.url.strip()
    format_id = req.format_id
    platform = req.platform.lower()

    if not is_valid_url(url, platform):
        raise HTTPException(status_code=400, detail="URL tidak valid.")

    # Prioritaskan TikWM untuk TikTok (anti-403 & direct stream)
    if platform == "tiktok":
        tikwm_data = await fetch_tiktok_tikwm(url)
        if tikwm_data:
            ext = "mp4"
            filesize = tikwm_data.get("size")

            if format_id in ["bestaudio/best", "music"]:
                download_url = make_tikwm_url(tikwm_data.get("music", ""))
                ext = "mp3"
            elif format_id == "watermark":
                download_url = make_tikwm_url(tikwm_data.get("wmplay") or tikwm_data.get("play", ""))
            else:
                download_url = make_tikwm_url(
                    tikwm_data.get("hdplay") or tikwm_data.get("play", "")
                )

            if download_url:
                title = tikwm_data.get("title") or "TikTok Video"
                return {
                    "download_url": download_url,
                    "title": title,
                    "ext": ext,
                    "filesize": filesize,
                }

    # Format selector untuk yt-dlp (YouTube & TikTok fallback)
    if platform == "tiktok":
        fmt = "best[ext=mp4]/best"
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

@app.get("/api/stream")
async def stream_download(media_url: str, platform: str = "youtube", filename: str = "video", ext: str = "mp4"):
    platform = platform.lower()
    if "tikwm.com" in media_url:
        referer = "https://www.tikwm.com/"
    else:
        referer = REFERER_MAP.get(platform, "https://www.google.com/")

    headers = {
        "User-Agent": DOWNLOAD_USER_AGENT,
        "Referer": referer,
        "Accept": "*/*",
    }

    client = httpx.AsyncClient(follow_redirects=True, timeout=60.0)
    try:
        req = client.build_request("GET", media_url, headers=headers)
        resp = await client.send(req, stream=True)
    except httpx.RequestError as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Gagal menghubungi server sumber video: {str(e)[:150]}")

    if resp.status_code >= 400:
        await resp.aclose()
        await client.aclose()
        raise HTTPException(
            status_code=422,
            detail=f"CDN sumber menolak download (HTTP {resp.status_code}). Link mungkin sudah kedaluwarsa — coba Ambil Info ulang."
        )

    safe_name = re.sub(r'[<>:"/\\|?*]', '', filename)[:80].strip() or "vidsnap"

    async def body_iterator():
        try:
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    resp_headers = {"Content-Disposition": f'attachment; filename="{safe_name}.{ext}"'}

    return StreamingResponse(
        body_iterator(),
        media_type=resp.headers.get("content-type", "application/octet-stream"),
        headers=resp_headers,
    )
