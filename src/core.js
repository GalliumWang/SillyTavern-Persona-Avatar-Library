import { createAvatar } from '@dicebear/core';
import { lorelei, adventurer, bottts, notionists, pixelArt } from '@dicebear/collection';

export const STYLES = Object.freeze({
    lorelei: { label: '简笔人物', definition: lorelei },
    adventurer: { label: '冒险者', definition: adventurer },
    bottts: { label: '机器人', definition: bottts },
    notionists: { label: '黑白人物', definition: notionists },
    pixelArt: { label: '像素人物', definition: pixelArt },
});

export function styleKey(value) {
    return Object.hasOwn(STYLES, value) ? value : 'lorelei';
}

// Display names are deliberately excluded: renaming must not change identity.
export function seedFor(avatarId, variant = 'fixed') {
    return JSON.stringify(['persona-avatar-library-v1', String(avatarId), String(variant)]);
}

export function randomVariant() {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values); // Also available over HTTP LAN access.
    return [...values].map(value => value.toString(16).padStart(8, '0')).join('');
}

export function avatarSvg(style, seed) {
    return createAvatar(STYLES[styleKey(style)].definition, {
        seed, size: 384,
        backgroundColor: ['c6e5dd', 'f4d8ba', 'd8d8f3', 'c8e0f2', 'efd3db', 'e7e4c2'],
    }).toString();
}

export function svgDataUrl(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function equalPixels(a, b) {
    if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
    return true;
}

export function serialQueue() {
    let tail = Promise.resolve();
    return task => {
        const next = tail.then(task);
        tail = next.catch(() => {});
        return next;
    };
}

// Never await this from PERSONA_CREATED: ST may write the file only after the
// event handlers have returned. Missing files are retried; custom files stop.
export async function waitForDefault({ read, enabled, pause, attempts = 45 }) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (!enabled()) return false;
        const result = await read();
        if (result === 'default') return enabled();
        if (result !== 'missing') return false;
        await pause(1000);
    }
    return false;
}
