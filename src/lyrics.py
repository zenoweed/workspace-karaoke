import re
import subprocess
import urllib.request
import urllib.parse
import json
import time

# ----------------------------
# TEXT CLEANING
# ----------------------------

def clean(text):
    text = re.sub(r"\(.*?\)", "", text)

    junk = ["official", "video", "music", "lyrics", "vevo", "HD", "4k", "Remaster"]
    for word in junk:
        text = re.sub(word, "", text, flags=re.IGNORECASE)

    text = re.sub(r"-+", "-", text)
    return text.strip()


def parse_youtube_title(artist, title):
    artist = re.sub(r"vevo", "", artist, flags=re.IGNORECASE).strip()
    artist = re.sub(r"\s*-\s*topic\s*$", "", artist, flags=re.IGNORECASE).strip()

    if " - " in title:
        parts = title.split(" - ", 1)
        artist = parts[0].strip()
        title = parts[1].strip()

    return clean(artist), clean(title)


# ----------------------------
# PLAYERCTL SAFE WRAPPERS
# ----------------------------

def safe_playerctl(args):
    try:
        return subprocess.check_output(
            ["playerctl"] + args,
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except:
        return ""


def get_song():
    artist = safe_playerctl(["metadata", "artist"])
    title = safe_playerctl(["metadata", "title"])

    if not artist or not title:
        return None, None

    return parse_youtube_title(artist, title)


def get_position():
    try:
        pos = subprocess.check_output(
            ["playerctl", "position"],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return float(pos)
    except:
        return 0.0


# ----------------------------
# LYRICS PARSING
# ----------------------------

def parse_lrc(lrc):
    lines = []
    for line in lrc.splitlines():
        m = re.match(r"\[(\d+):(\d+\.\d+)\](.*)", line)
        if m:
            minutes, seconds, text = m.groups()
            timestamp = int(minutes) * 60 + float(seconds)
            lines.append((timestamp, text.strip()))
    return lines


def get_current_lines(lrc_lines, position, context=4):
    current = 0

    for i, (ts, _) in enumerate(lrc_lines):
        if ts <= position:
            current = i

    start = max(0, current - 1)
    end = min(len(lrc_lines), current + context)

    result = []
    for i, (_, text) in enumerate(lrc_lines[start:end], start=start):
        prefix = "> " if i == current else "  "
        result.append(f"{prefix}{text}")

    return "\n".join(result)


# ----------------------------
# LYRICS FETCHING
# ----------------------------

def fetch_lyrics(artist, title):
    try:
        params = urllib.parse.urlencode({
            "artist_name": artist,
            "track_name": title
        })

        url = f"https://lrclib.net/api/search?{params}"

        with urllib.request.urlopen(url, timeout=20) as r:
            results = json.loads(r.read().decode())

        if not results:
            return None, None

        for result in results:
            synced = (result.get("syncedLyrics") or "").strip()
            plain = (result.get("plainLyrics") or "").strip()

            if synced:
                return "synced", synced
            if plain:
                return "plain", plain

        return None, None

    except Exception as e:
        return None, f"Error: {e}"


# ----------------------------
# CACHE
# ----------------------------

_cache = {"key": None, "type": None, "data": None}


# ----------------------------
# MAIN LOOP LOGIC
# ----------------------------

def update():
    artist, title = get_song()

    if not artist or not title:
        with open("/tmp/lyrics.txt", "w") as f:
            f.write("Nothing playing")
        return

    cache_key = f"{artist}|{title}"

    if _cache["key"] != cache_key:
        ltype, ldata = fetch_lyrics(artist, title)

        _cache["key"] = cache_key
        _cache["type"] = ltype
        _cache["data"] = ldata

    header = f"{artist} - {title}\n\n"

    if _cache["type"] == "synced":
        position = get_position()
        lrc_lines = parse_lrc(_cache["data"])
        text = header + get_current_lines(lrc_lines, position)

    elif _cache["type"] == "plain":
        text = header + _cache["data"]

    else:
        text = header + (_cache["data"] or "No lyrics found")

    with open("/tmp/lyrics.txt", "w") as f:
        f.write(text)


# ----------------------------
# ENTRY POINT (1s LOOP)
# ----------------------------

if __name__ == "__main__":
    while True:
        update()
        time.sleep(1)
