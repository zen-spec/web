import re

def extract_video_id(url):
    """Ekstrak ID video dari URL"""
    # YouTube
    youtube_patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
    ]
    for pattern in youtube_patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1), 'youtube'
    
    # TikTok
    tiktok_patterns = [
        r'tiktok\.com\/@[\w.-]+\/video\/(\d+)',
    ]
    for pattern in tiktok_patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1), 'tiktok'
    
    return None, None

def format_duration(seconds):
    """Konversi detik ke format MM:SS"""
    if not seconds:
        return '0:00'
    minutes = seconds // 60
    secs = seconds % 60
    return f"{minutes}:{secs:02d}"

def format_filesize(bytes):
    """Format ukuran file"""
    if not bytes:
        return 'Unknown'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes < 1024:
            return f"{bytes:.1f} {unit}"
        bytes /= 1024
