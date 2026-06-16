#!/usr/bin/env python3
"""Split reference/youtube.txt into youtube-chunks/ by timestamp segments."""
import re
import os
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / 'youtube.txt'
OUT = ROOT / 'youtube-chunks'

def parse_segments(text):
    lines = text.splitlines()
    ts_re = re.compile(r'^(\d{1,2}:\d{2})$')
    segments, i = [], 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if ts_re.match(line):
            ts, i = line, i + 1
            body = []
            while i < len(lines) and not ts_re.match(lines[i].strip()):
                if lines[i].strip():
                    body.append(lines[i].strip())
                i += 1
            segments.append((ts, '\n'.join(body)))
        else:
            body = [line]
            i += 1
            while i < len(lines) and not ts_re.match(lines[i].strip()):
                if lines[i].strip():
                    body.append(lines[i].strip())
                i += 1
            segments.append(('0:00', '\n'.join(body)))
    return segments

def main():
    if not SRC.exists() or SRC.stat().st_size == 0:
        print('youtube.txt is empty — save transcript in editor first, or use pre-built youtube-chunks/*.md')
        return 1
    text = SRC.read_text(encoding='utf-8')
    segments = parse_segments(text)
    OUT.mkdir(exist_ok=True)
    # Group ~40 segments per chunk file for manageable size
    per = max(1, len(segments) // 13)
    for n, start in enumerate(range(0, len(segments), per), 1):
        chunk = segments[start:start + per]
        md = OUT / f'{n:02d}-auto-segment.md'
        with md.open('w') as f:
            f.write(f'# Auto segment {n:02d}\n\n')
            for ts, body in chunk:
                f.write(f'[{ts}]\n{body}\n\n')
        print('wrote', md.name, len(chunk), 'segments')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
