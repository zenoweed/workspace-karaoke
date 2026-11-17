# workspace-karaoke

Synced lyrics for whatever is playing, overlaid on the GNOME desktop.

![Lyrics overlay scrolling through synced lines of the current song](docs/overlay.gif)

Works with any MPRIS media player (Firefox, Chrome, Spotify, …). Lyrics come from [lrclib.net](https://lrclib.net); the current track's artist and title are sent there to look them up. Nothing else to install or run.

Turn lyrics on and off with the **Lyrics** button in Quick Settings (top-right menu). In the Extensions app → Workspace Karaoke → settings you can pick the corner and distance from the edges, and edit the words and regexes stripped from track titles before the lyrics lookup. Changes apply live.

## Install from source (GNOME 46)

```sh
git clone https://github.com/zenoweed/workspace-karaoke
cd workspace-karaoke/src/workspace-karaoke@zenoweed.github.io
glib-compile-schemas schemas
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/workspace-karaoke@zenoweed.github.io
# log out and back in (Wayland), then:
gnome-extensions enable workspace-karaoke@zenoweed.github.io
```

If lyrics are out of sync, pause and resume once. Firefox (and Zen) only report the playback position after a track has been played, paused or seeked, and a YouTube autoplay track hasn't been. Until then the extension counts time itself from when it first sees the track.

## Test

```sh
glib-compile-schemas src/workspace-karaoke@zenoweed.github.io/schemas
gjs -m tests/lyrics.test.js
```

## Package for extensions.gnome.org

```sh
gnome-extensions pack src/workspace-karaoke@zenoweed.github.io --extra-source=lyrics.js --schema=schemas/org.gnome.shell.extensions.workspace-karaoke.gschema.xml
```
