# Capitaine Web Cursor

一个面向桌面 Chrome 的 Manifest V3 扩展，使用 Capitaine Cursors 素材替换网页中的十种特殊 CSS `cursor` 值，支持导入自己的 SVG、PNG 和 CUR 文件并校准热点。

扩展作用于网页内容区域，Chrome 标签栏、地址栏和菜单中的指针保持原样。

## 功能范围

| `cursor` 值 | 含义 |
| --- | --- |
| `grab` | 可以抓取 |
| `grabbing` | 正在抓取 |
| `zoom-in` | 放大 |
| `zoom-out` | 缩小 |
| `cell` | 单元格选择 |
| `vertical-text` | 垂直文本 |
| `alias` | 创建快捷方式 |
| `copy` | 复制 |
| `col-resize` | 列宽调整 |
| `row-resize` | 行高调整 |

扩展替换这些类型，普通箭头、链接手形、文本插入符及其他类型保持原样。网站设置了 `url(...)` 等图片指针时，优先保留网站的图片。

内置素材为每种类型提供独立的 Light / Dark SVG，显示尺寸为 32×32。Auto 模式通过 `prefers-color-scheme` 跟随浏览器的配色偏好，也可以固定使用 Light 或 Dark。

## 安装

需要 Chrome 120 或更高版本。从源码安装还需要 Node.js 24 或更高版本，在项目目录执行：

```sh
npm ci
npm run build
```

随后在 Chrome 中加载构建结果：

1. 打开 `chrome://extensions`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择生成的 `dist` 目录。
3. 刷新要使用扩展的网页，再将鼠标移入页面。
4. 可将扩展固定到工具栏，方便打开设置。

使用已构建的 ZIP 包时，解压后加载包含 `manifest.json` 的目录即可。

更新源码后重新构建，在扩展管理页重新加载扩展，再刷新已打开的网页。

## 效果预览

打开 [Cursor Test](https://vibhorjaiswal.github.io/Cursor-Test/)，将鼠标移入对应样例即可查看指针效果。可以通过扩展开关对比替换前后，或切换 Light / Dark 查看两套素材。

测试页包含多种 CSS `cursor` 值，其中本扩展支持的十种类型会使用所选资源，其余样例沿用浏览器、系统或网站的指针。

## 日常设置

扩展弹窗提供全局开关、显示模式和当前网站开关，修改后立即保存。完整设置中可展开「网站排除」编辑主机名列表，修改后点击「保存全局设置」。

网站排除按主机名精确匹配，不区分端口。例如，排除 `example.com` 后，`mail.example.com` 仍可使用扩展。排除顶层网站时，其中的内嵌页面（Frame）也不应用扩展指针，还可以单独排除内嵌页面的主机名。

关闭全局开关后，网页恢复原有指针。在 Chrome 管理页禁用或卸载扩展后，若页面仍显示替换指针，刷新即可。

## 自定义图片与热点

热点（hotspot）是图像中与鼠标坐标对齐的点，通常位于箭头尖端或手指尖，用于对齐显示与点击位置。

1. 打开完整设置，在「指针资源」中选择 Cursor 类型和要编辑的 Light / Dark 版本。
2. 导入自己的文件，也可以直接调整当前内置图片。
3. 点击或拖动放大图片上的十字准星设置热点，或填写源图坐标。聚焦校准画布后，可用方向键微调。
4. 将鼠标移入 1:1 试用区，对准加号点击。实际落点会被标出，便于比较指针尖端与点击位置。
5. 点击「应用」。

预览倍率与指针显示尺寸独立，热点按源图坐标保存。SVG / PNG 的初始热点为左上角 `(0, 0)`，CUR 则默认读取文件内置热点，手动校准后使用新坐标。

导入文件后，默认同时应用到 Light 和 Dark，也可以只应用当前版本。恢复默认只重置当前 Cursor 类型和所选版本，另一版本保留原配置。

保存后网页中的指针会更新。图片编辑与全局设置分别保存。

### 文件要求

单文件上限为 256 KiB。

| 格式 | 要求与处理方式 |
| --- | --- |
| SVG | UTF-8 编码，具有有效宽高或 `viewBox`，源画布各边不超过 4096。使用静态、自包含内容，显示长边设为 32 px |
| PNG | 宽高均为 1～128 px，按原始尺寸显示 |
| CUR | 静态 CUR，包含宽高均不超过 128 px 的可用图像。保留完整原文件，运行时采用兼容尺寸的图像和对应热点 |

SVG 中的脚本、事件处理代码、动画和外部依赖无法导入。ANI 和 ICO 暂未支持。

网页的内容安全策略（CSP）若禁止 `data:` 图片，该文档会改用内置指针，已保存配置和其他页面照常使用。内置图片的热点调整仍然有效。

## Windows 推荐搭配

扩展负责十种特殊 `cursor`，普通箭头、链接手形和文本光标等继续沿用浏览器与系统方案。搭配同系列系统素材，可以让常规与特殊指针的外观更统一。

| 项目 | 用途 |
| --- | --- |
| [Capitaine Cursors](https://github.com/keeferrourke/capitaine-cursors) | 原始图形与主题项目，提供 SVG 源素材 |
| [Capitaine Cursors for Windows 11 HiDPI](https://github.com/hervad/capitaine-cursors-w11-hidpi) | 第三方 Windows 移植，提供 Light / Dark 和 HiDPI 多尺寸系统光标方案 |
| [Auto Dark Mode](https://github.com/AutoDarkMode/Windows-Auto-Night-Mode) | 自动切换 Windows 的 Light / Dark 外观，并应用各模式配置的 cursor scheme（光标方案） |

推荐搭配方式：

1. 安装 Windows 打包版的 Light / Dark 光标方案。
2. 在 Auto Dark Mode 中启用光标切换，为 Light 和 Dark 分别选择对应方案。
3. 将 Chrome 的外观设为跟随系统，本扩展选择 Auto。

使用其他系统方案时，也可以通过自定义入口，为这十种类型选择相近风格的素材。

## 权限与数据

| 权限 | 用途 |
| --- | --- |
| `storage` | 在当前浏览器保存设置、排除主机名、自定义图片和热点配置 |
| `scripting` | 注入和清理指针样式 |
| HTTP / HTTPS 网页访问 | 在获准网页及 Frame 中读取目标元素的 computed style（计算样式）并应用指针 |

图片与设置使用 `chrome.storage.local` 保存在当前浏览器，项目没有外部服务、同步或统计上报。鼠标位置仅作为当前文档的运行状态使用。

应用到网页的指针图片 URL 会出现在 `getComputedStyle(element).cursor` 中。

## 开发与检查

首次运行浏览器测试前，安装项目使用的 Chromium：

```sh
npm run setup:browser
```

运行完整检查：

```sh
npm test
```

完整检查包含单元测试、构建、素材校验、分发包校验和浏览器测试。也可以按改动范围分别执行：

```sh
npm run test:unit
npm run build
npm run check:assets
npm run check:package
npm run test:browser
```

浏览器测试使用独立的临时配置，检查图片加载、坐标换算和状态恢复。实际显示效果可结合试用区检查。

启动开发测试页面：

```sh
npm run demo
```

页面地址为 `http://127.0.0.1:41731`。

## 支持情况

- 支持普通 DOM、开放式和嵌套 Shadow DOM。封闭式 Shadow DOM、单独设置指针的伪元素及原生控件内部组件不在当前覆盖范围。
- 处理鼠标输入。Canvas / WebGL 自绘鼠标和浏览器原生拖放反馈沿用网页或浏览器的实现。
- 网页自动替换不适用于 `chrome://`、Chrome Web Store、内置 PDF 阅读器、扩展页面及其他禁止注入的页面。

## 后续方向

后续可能将同样的图片导入、hotspot 校准和 Light / Dark 配置扩展到更多标准 CSS `cursor` 值，让用户在扩展内配置更完整的网页指针外观。网站提供的自定义图片指针，以及 `cursor: none` 和自绘鼠标行为继续保留。

## 许可

扩展代码、测试、构建脚本和文档采用 MIT 许可。

内置 Capitaine Cursors 素材由 Keefer Rourke 及其他贡献者提供，采用 LGPL-3.0-or-later。构建产物包含 MIT 许可全文，以及素材的原始 SVG、热点配置、来源版本和许可声明。
