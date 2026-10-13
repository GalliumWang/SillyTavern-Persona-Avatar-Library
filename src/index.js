import { default_user_avatar, eventSource, event_types, getRequestHeaders, getThumbnailUrl, saveSettingsDebounced } from '../../../../script.js';
import { power_user } from '../../../power-user.js';
import { getUserAvatars, user_avatar } from '../../../personas.js';
import { extension_settings } from '../../../extensions.js';
import { STYLES, styleKey, seedFor, randomVariant, avatarSvg, svgDataUrl, serialQueue, waitForDefault } from './core.js';
import { DefaultDetector, fetchImage, svgToPng } from './images.js';

const KEY = 'persona_avatar_library';
const enqueue = serialQueue();
const detector = new DefaultDetector(default_user_avatar);
const pending = new Set();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let root;
let busy = false;
let batchCancelled = false;
let knownIds = new Set();
let mounted = false;

function settings() {
    const value = extension_settings[KEY];
    if (!value || typeof value !== 'object' || Array.isArray(value)) extension_settings[KEY] = {};
    const config = extension_settings[KEY];
    if (typeof config.autoAssign !== 'boolean') config.autoAssign = false;
    config.style = styleKey(config.style);
    return config;
}

function exists(id) {
    return typeof id === 'string' && Object.hasOwn(power_user.personas ?? {}, id);
}

function nameOf(id) {
    return String(power_user.personas?.[id] || id);
}

function imageUrl(id) {
    return `/User%20Avatars/${encodeURIComponent(id)}`;
}

function status(message, error = false) {
    const output = root?.querySelector('[data-status]');
    if (output) {
        output.textContent = message;
        output.classList.toggle('pal-error', error);
    }
}

function report(error) {
    console.error('[Persona Avatar Library]', error);
    status(error.message || String(error), true);
    globalThis.toastr?.error(error.message || String(error), '人设头像库');
}

function setBusy(value) {
    busy = value;
    root?.querySelectorAll('[data-mutation]').forEach(button => { button.disabled = value; });
    const shortcut = document.getElementById('pal-persona-shortcut');
    if (shortcut) shortcut.disabled = value;
}

async function imageState(id) {
    if (!exists(id)) return 'deleted';
    const blob = await fetchImage(imageUrl(id), { missingOk: true });
    if (!blob) return 'missing';
    return await detector.isDefault(blob) ? 'default' : 'custom';
}

// Update images by their native URLs, without depending on QuickPersona's DOM.
function refreshVisibleImages(id) {
    for (const image of document.querySelectorAll('img[src]')) {
        try {
            const url = new URL(image.getAttribute('src'), location.href);
            if (url.origin !== location.origin) continue;
            const direct = decodeURIComponent(url.pathname) === `/User Avatars/${id}`;
            const thumbnail = /\/thumbnail$/.test(url.pathname)
                && url.searchParams.get('type') === 'persona' && url.searchParams.get('file') === id;
            if (direct || thumbnail) {
                url.searchParams.set('pal_v', String(Date.now()));
                image.src = url.href;
            }
        } catch { /* unrelated or malformed image URL */ }
    }
}

async function upload(id, svg, { defaultOnly = false, allowed = () => true } = {}) {
    if (!exists(id) || !allowed()) return false;
    const png = await svgToPng(svg);
    const write = async () => {
        if (!exists(id) || !allowed()) return false;
        // Recheck immediately before writing; a previous scan is not authority
        // to overwrite a custom image that the user uploaded in the meantime.
        if (defaultOnly && await imageState(id) !== 'default') return false;
        if (!exists(id) || !allowed()) return false;
        const body = new FormData();
        body.append('avatar', png, 'avatar.png');
        body.append('overwrite_name', id);
        const response = await fetch('/api/avatars/upload', {
            method: 'POST', headers: getRequestHeaders({ omitContentType: true }), body,
        });
        if (!response.ok) throw new Error(`保存“${nameOf(id)}”头像失败（HTTP ${response.status}）`);
        const result = await response.json();
        if (result.path !== id) throw new Error('头像接口返回了不同的文件名，请刷新页面检查');
        // ST invalidates server thumbnails itself. Reload browser caches too.
        const refreshes = await Promise.allSettled([
            fetchImage(imageUrl(id), { cache: 'reload' }),
            fetchImage(getThumbnailUrl('persona', id), { cache: 'reload' }),
        ]);
        if (refreshes.some(item => item.status === 'rejected')) console.warn('[Persona Avatar Library] 头像已保存，部分缓存刷新失败');
        refreshVisibleImages(id);
        return true;
    };
    // Coordinates our own tabs on browsers which expose Web Locks. HTTP LAN
    // environments still work through the local queue and the pre-write check.
    return navigator.locks?.request
        ? navigator.locks.request(`pal-avatar:${id}`, write)
        : write();
}

async function refreshPersonas(ids) {
    try {
        await getUserAvatars(true);
        for (const id of ids) {
            refreshVisibleImages(id);
            if (event_types.PERSONA_UPDATED) await eventSource.emit(event_types.PERSONA_UPDATED, id);
        }
    } catch (error) {
        console.warn('[Persona Avatar Library] 图片已保存，请刷新页面更新显示', error);
        globalThis.toastr?.warning('头像已保存，界面刷新失败；请重新加载页面。');
    }
    updateTarget();
}

function selectedId() {
    const id = root.querySelector('[data-persona]').value;
    if (!exists(id)) throw new Error('请先选择一个用户人设');
    return id;
}

function updateTarget() {
    if (!root) return;
    const select = root.querySelector('[data-persona]');
    const previous = select.value;
    select.replaceChildren();
    for (const id of Object.keys(power_user.personas ?? {}).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${nameOf(id)}${id === user_avatar ? '（当前）' : ''} · ${id}`;
        select.append(option);
    }
    if (exists(previous)) select.value = previous;
    else if (exists(user_avatar)) select.value = user_avatar;
}

function styleOptions(select, initial) {
    for (const [key, style] of Object.entries(STYLES)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = style.label;
        select.append(option);
    }
    select.value = styleKey(initial);
}

async function manualRandom() {
    if (busy) return;
    const id = selectedId();
    const style = settings().style;
    setBusy(true);
    try {
        await enqueue(async () => {
            const saved = await upload(id, avatarSvg(style, seedFor(id, randomVariant())));
            if (saved) {
                await refreshPersonas([id]);
                status(`已为“${nameOf(id)}”随机设置头像。`);
            }
        });
    } finally { setBusy(false); }
}

async function runBatch() {
    if (busy) return;
    const ids = Object.keys(power_user.personas ?? {});
    const style = settings().style;
    batchCancelled = false;
    setBusy(true);
    const cancel = root.querySelector('[data-cancel-batch]');
    cancel.hidden = false;
    const changed = [];
    let skipped = 0;
    let failed = 0;
    try {
        // Fail before making changes if the default reference is unavailable.
        await detector.getReference();
        await enqueue(async () => {
            for (let index = 0; index < ids.length && !batchCancelled; index++) {
                const id = ids[index];
                status(`正在检查 ${index + 1}/${ids.length}：${nameOf(id)} · 已设置 ${changed.length} 个`);
                try {
                    if (await imageState(id) !== 'default') { skipped++; continue; }
                    const saved = await upload(id, avatarSvg(style, seedFor(id, randomVariant())), {
                        defaultOnly: true, allowed: () => !batchCancelled,
                    });
                    if (saved) changed.push(id);
                    else skipped++;
                } catch (error) {
                    failed++;
                    console.warn(`[Persona Avatar Library] 跳过 ${id}`, error);
                }
            }
        });
        if (changed.length) await refreshPersonas(changed);
        status(`${batchCancelled ? '已停止' : '处理完成'}：设置 ${changed.length} 个，跳过 ${skipped} 个，失败 ${failed} 个。${failed ? '失败项可再次点击重试。' : ''}`, failed > 0);
    } finally {
        setBusy(false);
        cancel.hidden = true;
    }
}

function openPicker(id) {
    if (busy || !exists(id)) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'pal-dialog';
    dialog.setAttribute('aria-labelledby', 'pal-picker-title');
    dialog.innerHTML = `
        <div class="pal-dialog-head"><div><span class="pal-eyebrow">PERSONA AVATAR LIBRARY</span><h3 id="pal-picker-title"></h3></div><button type="button" class="pal-close" aria-label="关闭">×</button></div>
        <div class="pal-picker-controls"><label>头像风格 <select data-style></select></label><button type="button" data-shuffle>换一批</button><button type="button" data-fixed>按人设 ID 生成</button></div>
        <p class="pal-hint">点选喜欢的头像，再点“应用头像”。会替换此人设当前的头像。</p>
        <div class="pal-grid" role="group" aria-label="头像候选"></div>
        <p class="pal-picker-status" role="status" aria-live="polite">请选择一个头像</p>
        <div class="pal-dialog-foot"><span class="pal-credit"></span><button type="button" data-apply disabled>应用头像</button></div>`;
    dialog.querySelector('h3').textContent = `为“${nameOf(id)}”选择头像`;
    const select = dialog.querySelector('[data-style]');
    const grid = dialog.querySelector('.pal-grid');
    const apply = dialog.querySelector('[data-apply]');
    const feedback = dialog.querySelector('.pal-picker-status');
    let choice = null;
    let saving = false;
    styleOptions(select, settings().style);
    function render(fixed = false) {
        choice = null;
        apply.disabled = true;
        grid.replaceChildren();
        const style = select.value;
        for (let index = 0; index < 12; index++) {
            const seed = seedFor(id, fixed ? (index ? `fixed-${index}` : 'fixed') : randomVariant());
            const svg = avatarSvg(style, seed);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'pal-tile';
            button.setAttribute('aria-label', `${STYLES[style].label}头像 ${index + 1}`);
            button.setAttribute('aria-pressed', 'false');
            const image = document.createElement('img');
            image.src = svgDataUrl(svg);
            image.alt = '';
            button.append(image);
            button.addEventListener('click', () => {
                grid.querySelectorAll('button').forEach(tile => tile.setAttribute('aria-pressed', 'false'));
                button.setAttribute('aria-pressed', 'true');
                choice = svg;
                apply.disabled = false;
                feedback.textContent = `已选中第 ${index + 1} 个头像`;
            });
            grid.append(button);
        }
        dialog.querySelector('.pal-credit').textContent = style === 'adventurer'
            ? 'Adventurer · Lisa Wischofsky · CC BY 4.0 · DiceBear 改编'
            : '头像由 DiceBear 本地生成 · 授权信息见扩展说明';
        feedback.textContent = fixed ? '同一人设 ID、同一风格会得到相同的一组头像；改名不影响结果。' : '请选择一个头像';
    }
    const close = () => { if (!saving) dialog.close(); };
    dialog.querySelector('.pal-close').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('[data-shuffle]').addEventListener('click', () => render());
    dialog.querySelector('[data-fixed]').addEventListener('click', () => render(true));
    select.addEventListener('change', () => render());
    apply.addEventListener('click', async () => {
        if (!choice || saving || busy) return;
        const svg = choice;
        saving = true;
        setBusy(true);
        dialog.querySelectorAll('button, select').forEach(element => { element.disabled = true; });
        feedback.textContent = '正在保存头像…';
        try {
            const saved = await enqueue(() => upload(id, svg));
            if (!saved) throw new Error('此人设已被删除，请关闭窗口后重新选择');
            await refreshPersonas([id]);
            status(`已更新“${nameOf(id)}”的头像。`);
            dialog.close();
        } catch (error) {
            feedback.textContent = error.message;
            console.error('[Persona Avatar Library]', error);
        } finally {
            saving = false;
            setBusy(false);
            dialog.querySelectorAll('button, select').forEach(element => { element.disabled = false; });
        }
    });
    document.body.append(dialog);
    render();
    dialog.showModal();
}

function scheduleNew(id) {
    if (!settings().autoAssign || !exists(id) || pending.has(id)) return;
    pending.add(id);
    // A timer gives the host's creation handler time to save its image.
    setTimeout(async () => {
        try {
            const enabled = () => settings().autoAssign && exists(id);
            const ready = await waitForDefault({ read: () => imageState(id), enabled, pause });
            if (!ready) return;
            await enqueue(async () => {
                const saved = await upload(id, avatarSvg(settings().style, seedFor(id)), {
                    defaultOnly: true, allowed: enabled,
                });
                if (saved) {
                    await refreshPersonas([id]);
                    status(`已自动为“${nameOf(id)}”分配头像。`);
                }
            });
        } catch (error) { report(error); }
        finally { pending.delete(id); }
    }, 250);
}

function addShortcut() {
    if (document.getElementById('pal-persona-shortcut')) return;
    const nativeButton = document.getElementById('persona_set_image_button');
    if (!nativeButton) return;
    const button = document.createElement('button');
    button.id = 'pal-persona-shortcut';
    button.type = 'button';
    button.className = 'menu_button pal-native-button';
    button.textContent = '头像库';
    button.title = '为当前用户人设选择内置头像';
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!exists(user_avatar)) return globalThis.toastr?.info('请先选择一个用户人设');
        openPicker(user_avatar);
    });
    nativeButton.insertAdjacentElement('afterend', button);
}

function mount() {
    if (mounted) return;
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container) { console.error('[Persona Avatar Library] 找不到扩展设置容器'); return; }
    mounted = true;
    root = document.createElement('div');
    root.id = 'persona-avatar-library';
    root.className = 'pal-settings';
    root.innerHTML = `<div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header"><b>人设头像库</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
        <div class="inline-drawer-content">
            <p class="pal-hint">内置 5 种头像风格，离线生成，直接保存为用户人设头像。</p>
            <label class="pal-field">用户人设<select data-persona></select></label>
            <div class="pal-actions"><button type="button" data-picker data-mutation>打开头像库</button><button type="button" data-random data-mutation>随机替换所选头像</button></div>
            <label class="pal-field">随机 / 自动分配使用的风格<select data-style></select></label>
            <label class="pal-check"><input type="checkbox" data-auto><span>新建用户人设时自动分配头像</span></label>
            <p class="pal-hint">仅在新建人设仍使用默认图片时分配。已上传的图片会保留；开启开关不会处理已有的人设。</p>
            <div class="pal-batch"><button type="button" data-batch data-mutation>为所有默认头像随机分配</button><button type="button" data-cancel-batch hidden>停止</button></div>
            <p class="pal-hint">逐一检查图片内容，仅替换默认图片；缺失或无法确认的图片跳过。已生成的头像不会被重复替换。</p>
            <p data-status role="status" aria-live="polite">就绪</p>
            <details class="pal-about"><summary>头像来源与说明</summary><p>DiceBear 9.2.4：Lorelei / Adventurer（Lisa Wischofsky）、Bottts（Pablo Stanley）、Notionists（Zoish）、Pixel Art（DiceBear）。Adventurer 使用 CC BY 4.0；完整授权随插件附带于 THIRD_PARTY_LICENSES.md。</p><p>“按人设 ID 生成”使用头像文件名，不使用显示名字。头像保存后不会随改名或切换风格设置自动变化。</p></details>
        </div></div>`;
    container.append(root);
    styleOptions(root.querySelector('[data-style]'), settings().style);
    root.querySelector('[data-style]').addEventListener('change', event => {
        settings().style = styleKey(event.target.value);
        saveSettingsDebounced();
    });
    root.querySelector('[data-auto]').checked = settings().autoAssign;
    root.querySelector('[data-auto]').addEventListener('change', event => {
        // Reset the baseline so turning this on never sweeps existing personas.
        knownIds = new Set(Object.keys(power_user.personas ?? {}));
        settings().autoAssign = event.target.checked;
        saveSettingsDebounced();
        status(settings().autoAssign ? '已开启：以后新建的默认头像人设将自动分配。' : '已关闭新建人设自动分配。');
    });
    root.querySelector('[data-picker]').addEventListener('click', () => {
        try { openPicker(selectedId()); } catch (error) { report(error); }
    });
    root.querySelector('[data-random]').addEventListener('click', () => manualRandom().catch(report));
    root.querySelector('[data-batch]').addEventListener('click', () => runBatch().catch(report));
    root.querySelector('[data-cancel-batch]').addEventListener('click', () => {
        batchCancelled = true;
        status('正在停止；已发送的保存请求会完成。');
    });
    updateTarget();
    addShortcut();
    knownIds = new Set(Object.keys(power_user.personas ?? {}));
    if (event_types.PERSONA_CREATED) eventSource.on(event_types.PERSONA_CREATED, payload => {
        const id = typeof payload === 'string' ? payload : payload?.avatarId;
        updateTarget();
        if (id) { knownIds.add(id); scheduleNew(id); }
    });
    for (const event of [event_types.PERSONA_CHANGED, event_types.PERSONA_RENAMED, event_types.PERSONA_DELETED]) {
        if (event) eventSource.on(event, updateTarget);
    }
    // A cheap in-memory fallback catches third-party creators which omit the
    // native event. No image requests occur unless a new ID is actually found.
    setInterval(() => {
        const current = new Set(Object.keys(power_user.personas ?? {}));
        let changed = current.size !== knownIds.size;
        for (const id of current) if (!knownIds.has(id)) { changed = true; scheduleNew(id); }
        knownIds = current;
        if (changed) updateTarget();
        addShortcut();
    }, 2000);
}

// APP_READY is sticky in the current official release, including late installs.
eventSource.on(event_types.APP_READY, mount);
