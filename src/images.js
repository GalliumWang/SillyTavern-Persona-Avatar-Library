import Resize from '../node_modules/@jimp/plugin-resize/dist/esm/modules/resize.js';
import { equalPixels } from './core.js';

export async function fetchImage(url, { missingOk = false, cache = 'no-store' } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(url, { cache, signal: controller.signal });
        if (missingOk && response.status === 404) return null;
        if (!response.ok) throw new Error(`读取头像失败（HTTP ${response.status}）`);
        return await response.blob();
    } finally {
        clearTimeout(timeout);
    }
}

export async function loadImage(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
}

export async function pixels(blob) {
    const url = URL.createObjectURL(blob);
    try {
        const image = await loadImage(url);
        if (image.naturalWidth * image.naturalHeight > 16000000) throw new Error('图片过大，已跳过');
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function svgToPng(svg) {
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 384;
    canvas.getContext('2d').drawImage(image, 0, 0, 384, 384);
    return new Promise((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('无法生成 PNG 头像')), 'image/png',
    ));
}

export class DefaultDetector {
    constructor(defaultUrl) {
        this.defaultUrl = defaultUrl;
        this.reference = null;
        this.variants = new Map();
    }

    async getReference() {
        if (!this.reference) {
            this.reference = fetchImage(this.defaultUrl).then(pixels).catch(error => {
                this.reference = null;
                throw error;
            });
        }
        return this.reference;
    }

    async isDefault(blob) {
        const reference = await this.getReference();
        const current = await pixels(blob);
        if (equalPixels(reference, current)) return true;
        // Older ST builds resized the same default to 400×600. Use Jimp's exact
        // algorithm, not perceptual hashes or approximate thumbnail similarity.
        if (current.width !== 400 || current.height !== 600 || reference.width * 3 !== reference.height * 2) return false;
        const key = '400x600';
        if (!this.variants.has(key)) {
            new Resize(reference.width, reference.height, 400, 600, true, true, data => {
                this.variants.set(key, { width: 400, height: 600, data: new Uint8Array(data) });
            }).resize(reference.data);
        }
        return equalPixels(current, this.variants.get(key));
    }
}
