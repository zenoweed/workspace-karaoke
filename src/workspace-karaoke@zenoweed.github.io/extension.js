import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {backgroundCss, compileFilters, currentLines, parseLrc, parseTitle} from './lyrics.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

const TICK_MS = 500;
const WIDTH = 300;

const isCancelled = e => e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

function dbusCall(name, path, iface, method, params, replyType, cancellable) {
    return Gio.DBus.session.call(name, path, iface, method, params,
        new GLib.VariantType(replyType), Gio.DBusCallFlags.NONE, 1000, cancellable);
}

const LyricsToggle = GObject.registerClass(
class LyricsToggle extends QuickToggle {
    constructor(settings) {
        super({title: 'Lyrics', iconName: 'audio-x-generic-symbolic', toggleMode: true});
        settings.bind('show-lyrics', this, 'checked', Gio.SettingsBindFlags.DEFAULT);
    }
});

export default class KaraokeExtension extends Extension {
    enable() {
        this._cancellable = new Gio.Cancellable();
        this._session = new Soup.Session({user_agent: `karaoke-gnome-extension (${this.metadata.url})`, timeout: 20});
        this._track = null;
        this._clock = {elapsed: 0, last: GLib.get_monotonic_time()};

        // Background, padding and blur live on the box: Shell.BlurEffect in BACKGROUND
        // mode does nothing when attached straight to an St.Label.
        this._label = new St.Label({x_expand: true, x_align: Clutter.ActorAlign.FILL});
        this._label.clutter_text.line_wrap = true;
        this._box = new St.Bin({child: this._label, reactive: false});
        Main.uiGroup.add_child(this._box);

        this._settings = this.getSettings();
        this._settingsId = this._settings.connect('changed', (_s, key) => {
            if (key === 'title-filters')
                this._loadFilters();
            else if (key === 'show-lyrics')
                this._applyVisibility();
            else if (['background-color', 'background-opacity', 'blur-radius', 'text-outline'].includes(key))
                this._applyStyle();
            else
                this._place();
        });
        this._loadFilters();
        this._applyStyle();
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._place();

        this._indicator = new SystemIndicator();
        this._indicator.quickSettingsItems.push(new LyricsToggle(this._settings));
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._applyVisibility();
    }

    disable() {
        this._stop();
        this._indicator.quickSettingsItems.forEach(item => {
            Gio.Settings.unbind(item, 'checked');
            item.destroy();
        });
        this._indicator.destroy();
        this._indicator = null;
        Main.layoutManager.disconnect(this._monitorsId);
        this._settings.disconnect(this._settingsId);
        this._session.abort();
        this._box.destroy();
        this._box = this._label = this._session = this._cancellable = this._track = this._clock = this._settings = this._filters = this._blur = null;
        this._timeoutId = this._monitorsId = this._settingsId = 0;
    }

    // Off means hidden and idle: no D-Bus polling, no network.
    _applyVisibility() {
        this._stop();
        if (this._settings.get_boolean('show-lyrics'))
            this._tick(); // shows the label once there's text
    }

    _stop() {
        this._cancellable.cancel();
        this._cancellable = new Gio.Cancellable();
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
        this._box.hide();
    }

    // A changed cleaned-up title changes the track key, so lyrics are re-fetched on the next tick.
    _loadFilters() {
        this._filters = compileFilters(this._settings.get_strv('title-filters'));
    }

    _applyStyle() {
        const bg = backgroundCss(this._settings.get_string('background-color'),
            this._settings.get_int('background-opacity'));
        const outline = this._settings.get_boolean('text-outline') ? 'text-shadow: 0 0 2px 2px rgba(0,0,0,0.8);' : '';
        this._label.style = `color: white; font-size: 10px; font-family: monospace; ${outline}`;
        this._box.style = `width: ${WIDTH}px; padding: 8px; border-radius: 8px; background-color: ${bg};`;

        // ponytail: the blur is a plain rectangle; rounded blur needs a custom shader (as blur-my-shell does).
        const radius = this._settings.get_int('blur-radius');
        if (radius > 0) {
            if (!this._blur) {
                this._blur = new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND});
                this._box.add_effect(this._blur);
            }
            this._blur.radius = radius;
        } else if (this._blur) {
            this._box.remove_effect(this._blur);
            this._blur = null;
        }
        this._place();
    }

    _place() {
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        const corner = this._settings.get_string('corner');
        const dx = this._settings.get_int('x-offset');
        const dy = this._settings.get_int('y-offset');
        const x = corner.endsWith('left') ? m.x + dx : m.x + m.width - this._box.width - dx;
        const y = corner.startsWith('top') ? m.y + dy : m.y + m.height - this._box.height - dy;
        this._box.set_position(x, y);
    }

    // Runs one update, then schedules the next, so slow D-Bus or network calls never overlap.
    async _tick() {
        this._timeoutId = 0;
        const cancellable = this._cancellable;
        try {
            const text = await this._render(cancellable);
            if (!cancellable.is_cancelled()) {
                if (this._label.text !== text) {
                    this._label.text = text;
                    this._place(); // right and bottom corners depend on the label's size
                }
                this._box.visible = text !== ''; // no empty background box when nothing plays
            }
        } catch (e) {
            if (cancellable.is_cancelled() || isCancelled(e))
                return;
            console.warn(`karaoke: ${e.message}`);
        }
        if (cancellable.is_cancelled())
            return;
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_MS, () => {
            this._tick();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _render(cancellable) {
        const player = await this._findPlayer(cancellable);
        const md = player?.Metadata ?? {};
        const [artist, title] = parseTitle(md['xesam:artist']?.[0] ?? '', md['xesam:title'] ?? '', this._filters);
        if (!artist || !title)
            return '';

        const key = `${artist}|${title}`;
        if (this._track?.key !== key) {
            this._track = {key, header: `${artist} - ${title}\n\n`, text: ''};
            this._clock.elapsed = 0;
            this._clock.last = GLib.get_monotonic_time();
            try {
                Object.assign(this._track, await this._fetch(artist, title, cancellable));
            } catch (e) {
                this._track = null; // cancelled mid-fetch (toggled off); fetch again next time
                throw e;
            }
        }

        // Firefox reports Position 0 until the first play/pause/seek of a track
        // (YouTube autoplay never triggers one), and then only in whole seconds.
        // So keep our own clock and resync only when the player's position is
        // real and noticeably different.
        const now = GLib.get_monotonic_time();
        if (player.PlaybackStatus === 'Playing')
            this._clock.elapsed += (now - this._clock.last) / 1e6;
        this._clock.last = now;
        const reported = player.Position / 1e6;
        if (reported > 1 && Math.abs(reported - this._clock.elapsed) > 1.5)
            this._clock.elapsed = reported;

        const t = this._track;
        return t.header + (t.lines ? currentLines(t.lines, this._clock.elapsed) : t.text);
    }

    // First playing MPRIS player, else first paused one.
    // ponytail: re-lists players every tick; subscribe to NameOwnerChanged if this ever shows up in a profile.
    async _findPlayer(cancellable) {
        const [names] = (await dbusCall('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'ListNames', null, '(as)', cancellable)).deepUnpack();
        let paused = null;
        for (const name of names.filter(n => n.startsWith('org.mpris.MediaPlayer2.'))) {
            let props;
            try {
                [props] = (await dbusCall(name, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties',
                    'GetAll', new GLib.Variant('(s)', ['org.mpris.MediaPlayer2.Player']), '(a{sv})',
                    cancellable)).recursiveUnpack();
            } catch (e) {
                if (isCancelled(e))
                    throw e;
                continue;
            }
            if (props.PlaybackStatus === 'Playing')
                return props;
            if (props.PlaybackStatus === 'Paused')
                paused ??= props;
        }
        return paused;
    }

    async _fetch(artist, title, cancellable) {
        const url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
        try {
            const msg = Soup.Message.new('GET', url);
            const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancellable);
            if (msg.get_status() !== Soup.Status.OK)
                return {text: `Lyrics lookup failed (HTTP ${msg.get_status()})`};
            for (const r of JSON.parse(new TextDecoder().decode(bytes.get_data()))) {
                if (r.syncedLyrics?.trim())
                    return {lines: parseLrc(r.syncedLyrics)};
                if (r.plainLyrics?.trim())
                    return {text: r.plainLyrics.trim()};
            }
            return {text: 'No lyrics found'};
        } catch (e) {
            if (isCancelled(e))
                throw e;
            return {text: `Lyrics lookup failed: ${e.message}`};
        }
    }
}
