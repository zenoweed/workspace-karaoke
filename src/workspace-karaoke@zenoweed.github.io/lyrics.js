// Pure helpers: no GNOME imports, so tests can run them with plain gjs.

// "rgb(r,g,b)" (or any colour string whose first three numbers are r,g,b) + opacity % -> CSS rgba.
export function backgroundCss(color, opacityPercent) {
    const [r = 0, g = 0, b = 0] = (color.match(/\d+/g) ?? []).map(Number);
    return `rgba(${r},${g},${b},${opacityPercent / 100})`;
}

// A plain word matches whole words only ("hd" leaves "Shadow" alone);
// anything else is a case-insensitive regex. Invalid regexes are skipped.
export function compileFilters(entries) {
    const filters = [];
    for (const entry of entries.map(e => e.trim()).filter(Boolean)) {
        try {
            filters.push(new RegExp(/^\w+$/.test(entry) ? `\\b${entry}\\b` : entry, 'gi'));
        } catch {}
    }
    return filters;
}

function clean(text, filters) {
    for (const f of filters)
        text = text.replace(f, '');
    return text
        .replace(/-+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^[\s-]+|[\s-]+$/g, '');
}

// YouTube titles look like "Artist - Song (Official Video)" under channel "ArtistVEVO".
export function parseTitle(artist, title, filters) {
    artist = artist.replace(/vevo/gi, '').replace(/\s*-\s*topic\s*$/i, '').trim();
    const i = title.indexOf(' - ');
    if (i !== -1) {
        artist = title.slice(0, i);
        title = title.slice(i + 3);
    }
    return [clean(artist, filters), clean(title, filters)];
}

export function parseLrc(lrc) {
    const lines = [];
    for (const line of lrc.split('\n')) {
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
        if (m)
            lines.push([Number(m[1]) * 60 + Number(m[2]), m[3].trim()]);
    }
    return lines;
}

export function currentLines(lrcLines, position, context = 4) {
    let current = 0;
    lrcLines.forEach(([ts], i) => {
        if (ts <= position)
            current = i;
    });
    const start = Math.max(0, current - 1);
    return lrcLines
        .slice(start, current + context)
        .map(([, text], i) => (start + i === current ? '> ' : '  ') + text)
        .join('\n');
}
