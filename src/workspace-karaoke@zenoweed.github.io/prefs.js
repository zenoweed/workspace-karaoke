import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {compileFilters} from './lyrics.js';

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export default class KaraokePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keep alive as long as the window

        const group = new Adw.PreferencesGroup({
            title: 'Position',
            description: 'Changes apply immediately.',
        });

        const corner = new Adw.ComboRow({
            title: 'Corner',
            model: Gtk.StringList.new(['Top left', 'Top right', 'Bottom left', 'Bottom right']),
            selected: Math.max(0, CORNERS.indexOf(settings.get_string('corner'))),
        });
        corner.connect('notify::selected', () => settings.set_string('corner', CORNERS[corner.selected]));
        group.add(corner);

        for (const [key, title] of [['x-offset', 'Distance from side edge'], ['y-offset', 'Distance from top or bottom edge']]) {
            const row = Adw.SpinRow.new_with_range(0, 4000, 10);
            row.title = title;
            row.subtitle = 'Pixels';
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        }

        const page = new Adw.PreferencesPage();
        page.add(group);
        page.add(this._filtersGroup(settings));
        window.add(page);
    }

    _filtersGroup(settings) {
        const KEY = 'title-filters';
        const valid = s => compileFilters([s]).length === 1;
        const group = new Adw.PreferencesGroup({
            title: 'Title cleanup',
            description: 'Removed from track titles before looking up lyrics. A plain word matches whole words only; '
                + 'anything else is a case-insensitive regular expression, e.g. \\(.*?\\) removes anything in brackets. '
                + 'Press Enter to save an entry.',
        });

        const reset = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER, css_classes: ['flat']});
        reset.connect('clicked', () => settings.reset(KEY));
        group.set_header_suffix(reset);

        const add = new Adw.EntryRow({title: 'Add a word or regex', show_apply_button: true});
        add.connect('changed', () => add.remove_css_class('error'));
        add.connect('apply', () => {
            if (!valid(add.text))
                return add.add_css_class('error');
            settings.set_strv(KEY, [...settings.get_strv(KEY), add.text.trim()]);
            add.text = '';
        });

        let rows = [];
        const rebuild = () => {
            rows.forEach(r => group.remove(r));
            rows = settings.get_strv(KEY).map((filter, i) => {
                const row = new Adw.EntryRow({text: filter, show_apply_button: true});
                row.connect('changed', () => row.remove_css_class('error'));
                row.connect('apply', () => {
                    const list = settings.get_strv(KEY);
                    if (!row.text.trim())
                        list.splice(i, 1);
                    else if (valid(row.text))
                        list[i] = row.text.trim();
                    else
                        return row.add_css_class('error');
                    settings.set_strv(KEY, list);
                });

                const remove = new Gtk.Button({
                    icon_name: 'user-trash-symbolic', tooltip_text: 'Remove',
                    valign: Gtk.Align.CENTER, css_classes: ['flat'],
                });
                remove.connect('clicked', () => settings.set_strv(KEY, settings.get_strv(KEY).filter((_, j) => j !== i)));
                row.add_suffix(remove);

                group.add(row);
                return row;
            });
            // keep the "add" row last
            group.remove(add);
            group.add(add);
        };
        group.add(add);
        rebuild();
        settings.connect(`changed::${KEY}`, rebuild);
        return group;
    }
}
