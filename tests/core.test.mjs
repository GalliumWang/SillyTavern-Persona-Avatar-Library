import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, avatarSvg, equalPixels, randomVariant, seedFor, serialQueue, styleKey, waitForDefault } from '../src/core.js';

test('avatar identity is stable and independent of names, unique IDs yield different images', () => {
    for (const style of Object.keys(STYLES)) {
        const first = avatarSvg(style, seedFor('123-Alice.png'));
        assert.equal(first, avatarSvg(style, seedFor('123-Alice.png')));
        assert.notEqual(first, avatarSvg(style, seedFor('456-Alice.png')));
        assert.match(first, /^<svg/);
    }
    assert.equal(new Set(Array.from({ length: 100 }, randomVariant)).size, 100);
    assert.equal(styleKey('__proto__'), 'lorelei');
});

test('pixel detection rejects even a one-channel edit and mismatched dimensions', () => {
    const ref = { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) };
    assert.equal(equalPixels(ref, { ...ref, data: new Uint8Array([1, 2, 3, 255]) }), true);
    assert.equal(equalPixels(ref, { ...ref, data: new Uint8Array([1, 2, 4, 255]) }), false);
    assert.equal(equalPixels(ref, { ...ref, width: 2 }), false);
});

test('creation waits for the host file, and never accepts custom or missing images', async () => {
    const states = ['missing', 'missing', 'default'];
    let pauses = 0;
    assert.equal(await waitForDefault({ read: async () => states.shift(), enabled: () => true, pause: async () => pauses++ }), true);
    assert.equal(pauses, 2);
    assert.equal(await waitForDefault({ read: async () => 'custom', enabled: () => true, pause: async () => assert.fail('must stop') }), false);
    assert.equal(await waitForDefault({ read: async () => 'missing', enabled: () => true, pause: async () => {}, attempts: 2 }), false);
});

test('disabling auto while a file is pending prevents the write', async () => {
    let enabled = true;
    assert.equal(await waitForDefault({ read: async () => 'missing', enabled: () => enabled, pause: async () => { enabled = false; } }), false);
});

test('queue serializes writes and recovers after upload errors', async () => {
    const queue = serialQueue();
    const seen = [];
    const a = queue(async () => { seen.push('a'); throw new Error('upload'); });
    const b = queue(async () => { seen.push('b'); return 2; });
    await assert.rejects(a, /upload/);
    assert.equal(await b, 2);
    assert.deepEqual(seen, ['a', 'b']);
});
