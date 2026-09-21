import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-here'
    DOWNLOAD_FOLDER = 'downloads'
    MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB
    ALLOWED_EXTENSIONS = {'mp4', 'mp3', 'webm', 'm4a'}
    
    # Rate limiting
    RATE_LIMIT = '100 per hour'
