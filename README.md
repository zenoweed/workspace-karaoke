# karaoke

Synced lyrics for whatever is playing, overlaid on the GNOME desktop.

- `src/lyrics.py` reads the current track from `playerctl`, fetches lyrics from [lrclib.net](https://lrclib.net), and writes the current lines to `/tmp/lyrics.txt` every second.
- `src/lyrics@local/` is a GNOME Shell extension (45–48) that shows `/tmp/lyrics.txt` in the top-right of the screen.

## Run

```sh
sudo apt install playerctl
cp -r src/lyrics@local ~/.local/share/gnome-shell/extensions/
gnome-extensions enable lyrics@local   # log out/in first on Wayland
python3 src/lyrics.py
```
