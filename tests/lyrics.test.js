// Run: glib-compile-schemas src/workspace-karaoke@zenoweed.github.io/schemas && gjs -m tests/lyrics.test.js
import Gio from 'gi://Gio';
import {compileFilters, currentLines, parseLrc, parseTitle} from '../src/workspace-karaoke@zenoweed.github.io/lyrics.js';

function eq(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// Use the real defaults from the schema.
const dir = Gio.File.new_for_uri(import.meta.url).get_parent().resolve_relative_path('../src/workspace-karaoke@zenoweed.github.io/schemas').get_path();
const schema = Gio.SettingsSchemaSource.new_from_directory(dir, null, false)
    .lookup('org.gnome.shell.extensions.workspace-karaoke', false);
const filters = compileFilters(schema.get_key('title-filters').get_default_value().deepUnpack());
eq(filters.length, 13);

eq(parseTitle('Eagles', 'Eagles - Hotel California (Official Audio)', filters), ['Eagles', 'Hotel California']);
eq(parseTitle('EaglesVEVO', 'Hotel California [HD]', filters), ['Eagles', 'Hotel California']);
eq(parseTitle('Queen - Topic', 'Bohemian Rhapsody', filters), ['Queen', 'Bohemian Rhapsody']);
eq(parseTitle('Shadows', 'Shadow Music Video', filters), ['Shadows', 'Shadow']); // plain words match whole words only

// Custom: a regex, a word, and an invalid regex that must be skipped.
const custom = compileFilters(['feat\\..*', 'live', '(unclosed', '  ']);
eq(custom.length, 2);
eq(parseTitle('A', 'Song Live feat. B', custom), ['A', 'Song']);
eq(parseTitle('A', 'Song', []), ['A', 'Song']);

const lrc = parseLrc('[ar: x]\n[00:01.00]one\n[00:05.50]two\n[01:00]three\n');
eq(lrc, [[1, 'one'], [5.5, 'two'], [60, 'three']]);
eq(currentLines(lrc, 0), '> one\n  two\n  three');
eq(currentLines(lrc, 6), '  one\n> two\n  three');

print('ok');
