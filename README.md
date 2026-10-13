# 人设头像库 · Persona Avatar Library

给 SillyTavern 的用户人设快速设置不同的头像。内置 5 种 DiceBear 风格，生成过程在浏览器本地完成，不需要 API Key、图片服务或服务器插件。

## 安装

### 通过酒馆安装（推荐）

打开“扩展 → 安装扩展”，粘贴以下仓库地址，安装完成后刷新页面：

```text
https://github.com/GalliumWang/SillyTavern-Persona-Avatar-Library
```

在扩展管理中确认“人设头像库”已启用，然后打开“扩展 → 人设头像库”。后续可通过酒馆的扩展更新功能获取新版。

### 手动安装

1. 解压发布 ZIP，将整个 `SillyTavern-Persona-Avatar-Library` 文件夹放到你的酒馆目录：

   `SillyTavern/data/<你的用户目录>/extensions/SillyTavern-Persona-Avatar-Library/`

   单用户安装通常是 `data/default-user/extensions/`。请以你服务器实际目录为准。也可以安装到所有用户共享的 `public/scripts/extensions/third-party/`，两处任选一处，不要重复安装。
2. 确保 `manifest.json`、`index.js`、`style.css` 直接位于该文件夹内，不要多套一层同名文件夹。
3. 重新加载酒馆页面，在扩展管理中确认“人设头像库”已启用。
4. 打开“扩展 → 人设头像库”。原生人设管理的更换图片按钮旁也会出现“头像库”按钮。

发布包已经构建完成，无需安装 Node 依赖或运行 npm。如果酒馆部署在电脑或服务器上，即使从手机使用，也要把文件放到运行酒馆的那台设备上。

也可以从 GitHub 的 Code → Download ZIP 下载源码包，解压后将目录重命名为 `SillyTavern-Persona-Avatar-Library`，再按上述步骤放入酒馆。请勿将 ZIP 下载链接填入酒馆的“安装扩展”输入框，该输入框使用上方仓库地址。

## 功能

- **手动选图**：选择用户人设，打开头像库，选风格，在 12 张候选图中选一张并应用。移动端显示三列。
- **换一批**：随机生成下一组候选，不需要下载素材。
- **随机替换所选头像**：直接替换选中人设当前的图片，包括自定义图片。
- **按人设 ID 生成**：在选图窗口中生成固定候选组。同一 ID、同一风格、同一插件版本会得到同样的图组。
- **为所有默认头像随机分配**：按设置中选定的风格，给仍然使用默认图片的人设随机生成头像。已有自定义头像、已经分配过的头像会跳过；可中途停止，已经保存的图片保留。
- **新建用户人设时自动分配头像**：默认关闭。开启后，新建人设如果仍使用默认图片，就自动按 ID 生成一个固定头像。导入或复制人设时自带的非默认图片保留。开启此开关不会自动处理历史人设。

风格包括简笔人物 Lorelei、冒险者 Adventurer、机器人 Bottts、黑白人物 Notionists、像素人物 Pixel Art。

## 人设 ID 是什么？

官方 SillyTavern 用头像文件名 `avatarId` 作为人设键，例如 `1720000000000-Alice.png`；`Alice` 这样的显示名字是另一个字段。中文名字的人设文件名可能主要由时间戳组成。

插件直接覆盖原头像文件内容，保留文件名、人设名字、描述、世界书和绑定关系。正常改名不会改变 ID；重建或重新导入时是否沿用 ID 取决于导入方式。固定生成也不意味着不同 ID 在数学上绝不可能产生相似图案。

图片一旦保存就是普通 PNG。刷新、改名、关闭自动分配、更改风格设置或禁用此扩展，都不会自动改变已经保存的头像。

## 默认图片识别与兼容性

- 从当前酒馆读取 `default_user_avatar`，逐像素精确比较实际图片，不依据文件名、显示名字、图片是否“像默认图”判断。
- 支持原尺寸默认图，以及使用 Jimp 默认算法缩放到 400×600 的历史默认图。对裁剪、重绘、压缩或其他修改过的默认图，可能会保守地跳过；可手动选中该人设更换。
- 图片缺失时批量操作会跳过，读取或解码失败会计入失败。新建自动分配最多等待约 45 次重试，以兼容事件早于文件保存的时序；网络超时可能延长实际等待时间。
- 自动和批量操作在上传前会再次检查默认图片。服务器原生上传接口没有原子“比较后写入”，因此不要同时在多个设备上编辑同一个人设头像。
- 第三方人设创建工具不发出原生事件时，通过每两秒检查一次内存中的新 ID 进行补充识别；没有新 ID 时不读取头像文件。
- 使用原生头像上传接口和原生文件名，不要求安装 QuickPersona，不向提示词注入任何内容。
- 禁用扩展后，已保存头像仍保留。设置中的手动随机按钮会直接替换所选头像；需要保留原图时请先自行备份。

## 验证范围

以 2026-10-14 下载的官方 `release` 源码为接口依据（该源码 `package.json` 为 1.19.0），并在独立浏览器测试环境中运行原版 `SillyTavern/Extension-QuickPersona`。

验证了默认图批量替换、重复执行、自定义图片保护（包括仅一个像素的改动）、新建时序、关闭自动分配、未发事件的新建操作、固定头像与改名、上传失败恢复、写入前复查、批量停止、移动端 320/390 像素宽度、五种风格渲染及无外网请求。

这不是在你的真实酒馆实例上的实机验证。测试环境模拟了宿主的人设数据和上传接口，使用原版 QuickPersona 前端源码；不同主题或改版可能影响按钮布局。

## 开发与测试

```powershell
npm ci --ignore-scripts
npm run build
npm test
```

浏览器集成测试需要 Chrome（Windows 默认查找系统 Chrome），或通过 `PAL_BROWSER` 指定浏览器可执行文件。下载 QuickPersona 的 `index.js`，设置其本地路径：

```powershell
$env:QUICK_PERSONA_SOURCE = 'C:\path\to\QuickPersona\index.js'
npm run test:browser
```

测试启动临时本机服务器，只使用合成的人设和图片，不访问你的酒馆数据。

`src/` 是可读源代码，根目录 `index.js` 是已打包的离线运行文件。依赖通过 `package-lock.json` 锁定。

## 授权与来源

本扩展自有代码使用 MIT License。内置头像样式及第三方代码的完整授权见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。其中 Adventurer 原作者为 Lisa Wischofsky，使用 CC BY 4.0；图库和设置中保留了署名。不要移除第三方授权文件。

- SillyTavern 人设实现：https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/personas.js
- SillyTavern 头像接口：https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/avatars.js
- QuickPersona：https://github.com/SillyTavern/Extension-QuickPersona
- DiceBear：https://www.dicebear.com/
