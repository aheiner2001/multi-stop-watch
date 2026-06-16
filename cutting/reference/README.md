# Reference — Huberman Fat Loss Video

## Files

| Path | Purpose |
|------|---------|
| `youtube.txt` | Full raw transcript (save from editor if empty on disk) |
| `youtube-chunks/` | 13 topic-based chunks with protocols extracted |
| `youtube-extracted/tools.json` | Machine-readable tool list + app implementation status |
| `youtube-extracted/TOOLS.md` | Human index of chunks and app mapping |
| `split-transcript.py` | Re-chunk raw `youtube.txt` when you update the transcript |

## Workflow

1. Paste or save full transcript to `youtube.txt`
2. Read curated chunks in `youtube-chunks/01-intro.md` … `13-recap.md`
3. Check `youtube-extracted/tools.json` for `missing_for_app` (should be empty after app updates)
4. Optional: `python3 split-transcript.py` for auto-segmentation from raw file

## Source

Huberman Lab Essentials — Fat Loss (Andrew Huberman)
