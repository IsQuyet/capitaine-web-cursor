# Capitaine Web Cursor

一个面向桌面 Chrome 的扩展，用 Capitaine Cursors 素材替换网页中的十种特殊 CSS `cursor`。

内置 Light / Dark SVG，Auto 跟随浏览器配色。支持导入自己的 SVG / PNG / CUR，并可视化校准热点（hotspot）。

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

普通箭头、链接手形和文本插入符沿用原方案，网站自带的图片指针和 `cursor: none` 始终保留。

## 安装

需要 Chrome 120 或更高版本。从源码构建需要 Node.js 24 或更高版本，在项目目录执行：

```sh
npm ci
npm run build
```

1. 打开 `chrome://extensions`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择生成的 `dist` 目录。
3. 刷新要使用扩展的网页。

更新源码后，重新构建、重新加载扩展并刷新网页。

浏览器内置页面和 Chrome Web Store 不支持指针替换。

## 效果预览

在 [Cursor Test](https://vibhorjaiswal.github.io/Cursor-Test/) 中查看各类指针，通过扩展开关和 Light / Dark 对比效果。

## 自定义指针

在完整设置的「指针资源」中更换图片或校准热点，Light / Dark 可分别配置，也可共用同一图片。

热点是指针图像中对准点击位置的点，可通过放大画布校准，并在试用区检查实际落点。CUR 默认读取文件内置热点。

单文件上限为 256 KiB，SVG 需为静态、自包含内容。PNG 最大 128×128 px，CUR 至少包含一份这一范围内的图像。

部分网站的内容安全策略（CSP）会阻止导入图片，此时该页面改用内置指针，已保存配置保留。

## Windows 推荐搭配

搭配同系列的 Windows 系统光标，可统一常规与特殊指针的风格。

| 项目 | 用途 |
| --- | --- |
| [Capitaine Cursors](https://github.com/keeferrourke/capitaine-cursors) | 原始图形与 SVG 源素材 |
| [Capitaine Cursors for Windows 11 HiDPI](https://github.com/hervad/capitaine-cursors-w11-hidpi) | 第三方 Windows 移植，提供 Light / Dark 和 HiDPI 多尺寸光标方案 |
| [Auto Dark Mode](https://github.com/AutoDarkMode/Windows-Auto-Night-Mode) | 自动切换 Windows 的 Light / Dark 外观及对应的 cursor scheme（光标方案） |

1. 安装 Windows 打包版的 Light / Dark 光标方案。
2. 在 Auto Dark Mode 中启用光标切换，为 Light 和 Dark 分别选择对应方案。
3. 将 Chrome 的外观设为跟随系统，本扩展选择 Auto。

## 权限与数据

扩展使用网页访问权限识别和替换指针。设置与图片保存在当前浏览器本地，没有外部服务、同步或统计上报。

## 开发

```sh
npm run setup:browser  # 首次准备测试浏览器
npm test               # 完整检查
npm run demo           # 本地测试页
```

## 后续方向

后续可能将同样的自定义能力扩展到更多标准 CSS `cursor` 值，提供更完整的网页指针配置。

## 许可

扩展代码、测试、构建脚本和文档采用 MIT 许可。

内置 Capitaine Cursors 素材由 Keefer Rourke 及其他贡献者提供，采用 LGPL-3.0-or-later。
