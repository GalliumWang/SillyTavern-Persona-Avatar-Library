import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
await mkdir(path.join(project, 'test-results'), { recursive: true });
await build({ entryPoints: [path.join(project, 'src/images.js')], outfile: path.join(project, 'test-results/images.js'), bundle: true, format: 'esm' });
const files = new Map();
const uploads = [];
let defaultPng;
let failId = '';
let beforeUpload = null;
let onImageRead = null;
const extensionPath = '/scripts/extensions/third-party/Persona-Avatar-Library';
const script = `
export const default_user_avatar = '/img/user-default.png';
export const animation_duration = 0;
export const event_types = Object.fromEntries(['APP_READY','PERSONA_CREATED','PERSONA_CHANGED','PERSONA_UPDATED','PERSONA_RENAMED','PERSONA_DELETED','CHAT_CHANGED','SETTINGS_UPDATED'].map(x=>[x,x]));
const listeners = new Map(); let ready = false;
export const eventSource = { on(key, fn) { const list = listeners.get(key)||[]; list.push(fn); listeners.set(key,list); if(key==='APP_READY'&&ready) fn(); }, async emit(key,payload) { if(key==='APP_READY') ready=true; for(const fn of listeners.get(key)||[]) await fn(payload); } };
export function getRequestHeaders(options) { return options?.omitContentType ? {'X-CSRF-Token':'test-token'} : {'Content-Type':'application/json','X-CSRF-Token':'test-token'}; }
export function getThumbnailUrl(type,file,bust=false) { return '/thumbnail?type='+type+'&file='+encodeURIComponent(file)+(bust?'&t='+Date.now():''); }
export function saveSettingsDebounced() { window.savedSettings++; eventSource.emit('SETTINGS_UPDATED'); }
window.savedSettings = 0; window.host = {eventSource,event_types};
`;
const personas = `
import { power_user } from './power-user.js';
import { eventSource } from '../script.js';
export let user_avatar = 'default-a.png';
export function getUserAvatar(id) { return '/User Avatars/'+id; }
export async function getUserAvatars(render=true) { if(render) window.renderCalls=(window.renderCalls||0)+1; return Object.keys(power_user.personas); }
export async function setUserAvatar(id) { user_avatar=id; await eventSource.emit('PERSONA_CHANGED',id); }
window.host.setUserAvatar = setUserAvatar;
window.host.add = async (id,name,emit=true) => { power_user.personas[id]=name; power_user.persona_descriptions[id]={description:'KEEP '+id,connections:[{type:'character',id:'char.png'}]}; if(emit) await eventSource.emit('PERSONA_CREATED',{avatarId:id,name}); };
window.host.rename = async (id,name) => { power_user.personas[id]=name; await eventSource.emit('PERSONA_RENAMED',{avatarId:id,newName:name}); };
`;
const powerUser = `export const power_user = { personas: {'default-a.png':'测试人设 A','default-b.png':'测试人设 B','custom.png':'自定义头像','missing.png':'缺失图片'}, persona_descriptions: {'default-a.png':{description:'Keep this description',connections:[{type:'character',id:'char.png'}]}},default_persona:'default-a.png'}; window.power_user=power_user;`;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>人设头像库测试</title>
<link rel="stylesheet" href="${extensionPath}/style.css"><style>body{font-family:system-ui;background:#171b21;color:#eceef2;padding:20px;margin:0}main{max-width:680px;margin:auto}.inline-drawer-content{display:block}h1{font-size:22px}#quickPersonaImg,.quickPersonaMenuImg{width:48px;height:48px}#quickPersonaMenu ul{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0}#extensions_settings{max-width:540px;margin:24px auto}#persona_set_image_button{padding:10px}#leftSendForm{display:flex;margin:16px 0}button{color:inherit}*{box-sizing:border-box}</style>
<main><h1>SillyTavern · 扩展测试环境</h1><button id="persona_set_image_button">更换头像</button><div id="leftSendForm"></div><div id="extensions_settings"></div></main>
<script src="/jquery.js"></script><script>window.toastr={error:console.warn,warning:console.warn,info:console.log};</script>
<script type="module">import {eventSource} from '/script.js'; import '${extensionPath}/index.js'; import '/scripts/extensions/third-party/QuickPersona/index.js'; await eventSource.emit('APP_READY');</script></html>`;

// Uses the actual upstream QuickPersona file when supplied. Keep downloaded
// third-party sources outside the distributed plugin.
const upstreamQuick = process.env.QUICK_PERSONA_SOURCE || path.join(project, '../avatar-research/quick-persona.js');
const quickSource = await readFile(upstreamQuick, 'utf8');
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        const route = decodeURIComponent(url.pathname);
        const send = (body, type = 'application/javascript') => { response.setHeader('Content-Type', type); response.end(body); };
        if (route === '/') return send(html, 'text/html');
        if (route === '/script.js') return send(script);
        if (route === '/scripts/power-user.js') return send(powerUser);
        if (route === '/scripts/personas.js') return send(personas);
        if (route === '/scripts/extensions.js') return send('export const extension_settings = {}; window.extension_settings=extension_settings;');
        if (route === '/lib.js') return send('export const Popper = {createPopper(){return {update(){},destroy(){}}}};');
        if (route === '/jquery.js') return send(await readFile(path.join(project, 'node_modules/jquery/dist/jquery.min.js')));
        if (route === '/scripts/extensions/third-party/QuickPersona/index.js') return send(quickSource);
        if (route === `${extensionPath}/index.js`) return send(await readFile(path.join(project, 'index.js')));
        if (route === `${extensionPath}/style.css`) return send(await readFile(path.join(project, 'style.css')), 'text/css');
        if (route === '/test-images.js') return send(await readFile(path.join(project, 'test-results/images.js')));
        if (route === '/test-resizer.js') return send(await readFile(path.join(project, 'node_modules/@jimp/plugin-resize/dist/esm/modules/resize.js')));
        if (route === '/img/user-default.png' || route === '/img/ai4.png') return send(defaultPng, 'image/png');
        if (route.startsWith('/User Avatars/') || route === '/thumbnail') {
            const id = route === '/thumbnail' ? url.searchParams.get('file') : route.slice('/User Avatars/'.length);
            if (!files.has(id)) { response.statusCode = 404; return response.end(); }
            const data = files.get(id);
            if (route.startsWith('/User Avatars/') && onImageRead) onImageRead(id);
            return send(data, 'image/png');
        }
        if (route === '/api/avatars/upload') {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const form = await new Request('http://localhost/upload', { method: 'POST', headers: request.headers, body: Buffer.concat(chunks) }).formData();
            assert.equal(request.headers['x-csrf-token'], 'test-token');
            const id = form.get('overwrite_name');
            if (failId === id) { response.statusCode = 500; return response.end('Injected failure'); }
            const data = Buffer.from(await form.get('avatar').arrayBuffer());
            assert.equal(data.subarray(1, 4).toString(), 'PNG');
            if (beforeUpload) await beforeUpload(id);
            files.set(id, data);
            uploads.push(id);
            return send(JSON.stringify({ path: id }), 'application/json');
        }
        response.statusCode = 404; response.end();
    } catch (error) { response.statusCode = 500; response.end(error.stack); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.PAL_BROWSER || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 1000 } });
const page = await context.newPage();
const errors = [];
const external = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (!request.url().startsWith(base) && !/^(data:|blob:|about:)/.test(request.url())) external.push(request.url()); });
const waitUploads = async count => { for (let i = 0; i < 160 && uploads.length < count; i++) await page.waitForTimeout(100); assert.equal(uploads.length, count); };
const selector = part => `#persona-avatar-library ${part}`;
const selectPersona = async id => page.selectOption(selector('[data-persona]'), id);
try {
    // Generate a synthetic default, so tests do not redistribute ST artwork.
    const imageData = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, 512, 768);
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(256, 260, 100, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(110, 420, 292, 320);
        const original = canvas.toDataURL().split(',')[1];
        // A tiny edit must NOT be mistaken for the default.
        ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, 1, 1);
        return { original, custom: canvas.toDataURL().split(',')[1] };
    });
    defaultPng = Buffer.from(imageData.original, 'base64');
    files.set('default-a.png', defaultPng); files.set('default-b.png', defaultPng);
    const custom = Buffer.from(imageData.custom, 'base64'); files.set('custom.png', custom);
    await page.goto(base);
    await page.waitForSelector(selector('[data-picker]'));
    const legacyDefault = await page.evaluate(async () => {
        const { pixels } = await import('/test-images.js');
        const { default: Resize } = await import('/test-resizer.js');
        const original = await pixels(await (await fetch('/img/user-default.png')).blob());
        let data;
        new Resize(original.width, original.height, 400, 600, true, true, buffer => { data = new Uint8ClampedArray(buffer); }).resize(original.data);
        const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 600;
        canvas.getContext('2d').putImageData(new ImageData(data, 400, 600), 0, 0);
        return canvas.toDataURL().split(',')[1];
    });
    files.set('default-b.png', Buffer.from(legacyDefault, 'base64'));
    assert.equal(await page.isChecked(selector('[data-auto]')), false);
    await page.click(selector('[data-batch]'));
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.startsWith('处理完成'));
    assert.deepEqual(uploads, ['default-a.png', 'default-b.png']);
    assert.deepEqual(files.get('custom.png'), custom);
    assert.notDeepEqual(files.get('default-a.png'), files.get('default-b.png'));
    assert.match(await page.textContent(selector('[data-status]')), /设置 2 个，跳过 2 个，失败 0 个/);
    await page.click(selector('[data-batch]'));
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.startsWith('处理完成'));
    assert.equal(uploads.length, 2); // Never rerandomize generated avatars.
    assert.equal(await page.evaluate(() => window.power_user.persona_descriptions['default-a.png'].description), 'Keep this description');
    assert.equal(await page.evaluate(() => window.power_user.default_persona), 'default-a.png');
    console.log('PASS bulk: only defaults, idempotence, one-pixel custom preserved, metadata unchanged');

    await page.click('#quickPersona');
    await page.waitForSelector('#quickPersonaMenu');
    assert.equal(await page.locator('#quickPersonaMenu img').count(), 4);
    assert.equal(await page.locator('#quickPersonaMenu img').first().evaluate(img => new URL(img.src).searchParams.get('file')), 'default-a.png');
    await page.click('#quickPersona');
    await page.check(selector('[data-auto]'));
    await page.evaluate(() => window.host.add('new.png', '新建人设'));
    await page.waitForTimeout(1400); // Host emits before it saves the default image.
    files.set('new.png', defaultPng);
    await waitUploads(3);
    files.set('new-custom.png', custom);
    await page.evaluate(() => window.host.add('new-custom.png', '带自定义图片'));
    await page.waitForTimeout(600);
    assert.equal(uploads.length, 3);
    files.set('fallback.png', defaultPng);
    await page.evaluate(() => window.host.add('fallback.png', '第三方创建', false));
    await waitUploads(4);
    await page.evaluate(() => window.host.add('cancel-auto.png', '取消自动'));
    await page.uncheck(selector('[data-auto]'));
    files.set('cancel-auto.png', defaultPng);
    await page.waitForTimeout(1300);
    assert.equal(uploads.length, 4);
    console.log('PASS automatic: event-before-file race, custom upload protection, no-event creator, toggle-off cancellation');

    await selectPersona('default-a.png');
    await page.click(selector('[data-picker]'));
    await page.click('.pal-dialog [data-fixed]');
    const beforeRename = await page.locator('.pal-tile img').first().getAttribute('src');
    await page.click('.pal-tile >> nth=0');
    await page.click('.pal-dialog [data-apply]');
    await page.waitForSelector('.pal-dialog', { state: 'detached' });
    await waitUploads(5);
    await page.evaluate(() => window.host.rename('default-a.png', '<img src=x onerror=alert(1)>改名测试'));
    await page.click(selector('[data-picker]'));
    await page.click('.pal-dialog [data-fixed]');
    assert.equal(await page.locator('.pal-tile img').first().getAttribute('src'), beforeRename);
    assert.equal(await page.locator('.pal-dialog h3 img').count(), 0);
    await page.click('.pal-close');
    assert.match(await page.getAttribute('#quickPersonaImg', 'src'), /pal_v=/);
    console.log('PASS manual picker, fixed-ID generation after rename, escaped persona names, QuickPersona cache refresh');

    failId = 'custom.png';
    await selectPersona('custom.png');
    await page.click(selector('[data-random]'));
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('HTTP 500'));
    assert.deepEqual(files.get('custom.png'), custom);
    assert.equal(await page.isDisabled(selector('[data-random]')), false);
    failId = '';
    await page.click(selector('[data-random]'));
    await waitUploads(6);
    console.log('PASS upload failure recovery');

    // The scan sees a default, but another action replaces it before upload.
    files.set('cancel-auto.png', custom);
    files.set('race.png', defaultPng);
    await page.evaluate(() => window.host.add('race.png', '检查后被改图'));
    onImageRead = id => { if (id === 'race.png') files.set(id, custom); };
    await page.click(selector('[data-batch]'));
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.startsWith('处理完成'));
    onImageRead = null;
    assert.equal(uploads.length, 6);
    assert.deepEqual(files.get('race.png'), custom);
    files.set('cancel-batch-a.png', defaultPng); files.set('cancel-batch-b.png', defaultPng);
    await page.evaluate(async () => { await window.host.add('cancel-batch-a.png', '批量 A'); await window.host.add('cancel-batch-b.png', '批量 B'); });
    beforeUpload = async id => { if (id === 'cancel-batch-a.png') await page.click('[data-cancel-batch]'); };
    await page.click(selector('[data-batch]'));
    await page.waitForFunction(() => document.querySelector('[data-status]').textContent.startsWith('已停止'));
    beforeUpload = null;
    assert.equal(uploads.length, 7);
    assert.deepEqual(files.get('cancel-batch-b.png'), defaultPng);
    console.log('PASS pre-upload recheck and batch cancellation');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.host.rename('default-a.png', '旅行者'));
    await selectPersona('default-a.png');
    await page.click(selector('[data-picker]'));
    await page.click('.pal-dialog [data-fixed]');
    await page.locator('.pal-tile').first().click();
    assert.equal(await page.locator('.pal-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3);
    assert.equal(await page.locator('.pal-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    for (const style of ['lorelei', 'adventurer', 'bottts', 'notionists', 'pixelArt']) {
        await page.selectOption('.pal-dialog [data-style]', style);
        await page.waitForFunction(() => [...document.querySelectorAll('.pal-tile img')].every(img => img.complete && img.naturalWidth > 0));
    }
    await page.selectOption('.pal-dialog [data-style]', 'lorelei');
    await page.locator('.pal-tile').first().click();
    await page.screenshot({ path: path.join(project, 'test-results/mobile-picker.png') });
    await page.setViewportSize({ width: 320, height: 640 });
    assert.equal(await page.locator('.pal-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('.pal-close');
    await page.screenshot({ path: path.join(project, 'test-results/mobile-settings.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log('PASS mobile: 390px, all five styles render, no horizontal overflow, no external network requests');
    await writeFile(path.join(project, 'test-results/browser-results.json'), JSON.stringify({ passed: true, uploads, pageErrors: errors, externalRequests: external }, null, 2));
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
