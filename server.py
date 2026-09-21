from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import os
import re
import requests
from io import BytesIO

app = Flask(__name__)
CORS(app)  # Agar frontend bisa akses

# Folder untuk save sementara
DOWNLOAD_FOLDER = 'downloads'
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

def is_tiktok(url):
    return bool(re.search(r'tiktok\.com|vm\.tiktok\.com', url, re.IGNORECASE))

def is_youtube(url):
    return bool(re.search(r'youtube\.com|youtu\.be', url, re.IGNORECASE))

def is_valid_url(url):
    return is_tiktok(url) or is_youtube(url)

@app.route('/')
def home():
    return "🚀 Video Downloader API Running!"

@app.route('/api/info', methods=['POST'])
def get_info():
    """Ambil info video sebelum download"""
    try:
        data = request.json
        url = data.get('url', '')
        
        if not is_valid_url(url):
            return jsonify({'error': 'URL tidak valid!'}), 400
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Ambil format yang tersedia
            formats = []
            if info.get('formats'):
                for f in info['formats']:
                    if f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                        formats.append({
                            'format_id': f.get('format_id'),
                            'ext': f.get('ext'),
                            'resolution': f.get('resolution', 'Unknown'),
                            'filesize': f.get('filesize', 0)
                        })
            
            return jsonify({
                'status': 'success',
                'title': info.get('title', 'Unknown'),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'uploader': info.get('uploader', ''),
                'formats': formats[:10]  # Ambil 10 format teratas
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download_video():
    """Download video dan return file"""
    try:
        data = request.json
        url = data.get('url', '')
        format_id = data.get('format', 'best')
        is_audio = data.get('audio_only', False)
        
        if not is_valid_url(url):
            return jsonify({'error': 'URL tidak valid!'}), 400
        
        output_path = os.path.join(DOWNLOAD_FOLDER, '%(id)s.%(ext)s')
        
        ydl_opts = {
            'format': 'bestaudio/best' if is_audio else format_id,
            'outtmpl': output_path,
            'quiet': True,
            'no_warnings': True,
        }
        
        # Untuk TikTok tanpa watermark
        if is_tiktok(url):
            ydl_opts['http_headers'] = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
            # Rename jika audio only
            if is_audio:
                base = os.path.splitext(filename)[0]
                audio_file = base + '.mp3'
                if os.path.exists(audio_file):
                    filename = audio_file
        
        if os.path.exists(filename):
            return send_file(
                filename,
                as_attachment=True,
                download_name=os.path.basename(filename)
            )
        else:
            return jsonify({'error': 'File tidak ditemukan'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/quick-download', methods=['POST'])
def quick_download():
    """Endpoint cepat - return direct URL video"""
    try:
        data = request.json
        url = data.get('url', '')
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            video_url = info.get('url') or info.get('formats', [{}])[-1].get('url')
            
            return jsonify({
                'status': 'success',
                'url': video_url,
                'title': info.get('title'),
                'ext': info.get('ext', 'mp4')
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
