import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let label, timeout;

export default class LyricsExtension {
  enable() {
label = new St.Label({
  style: `
    color: white;
    font-size: 10px;
    font-family: monospace;
    width: 300px;
  `,
  x: Main.layoutManager.primaryMonitor.width - 300 - 240,
  y: 60,
  reactive: false,
});

    label.clutter_text.line_wrap = true;

    Main.uiGroup.add_child(label);
    this._update();
  }

  _update() {
    try {
      const [, contents] = GLib.file_get_contents('/tmp/lyrics.txt');
      label.set_text(new TextDecoder().decode(contents));
    } catch {
      label.set_text('');
    }
    timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
      this._update();
      return GLib.SOURCE_REMOVE;
    });
  }

  disable() {
    if (timeout) GLib.source_remove(timeout);
    label?.destroy();
    label = null;
  }
}
