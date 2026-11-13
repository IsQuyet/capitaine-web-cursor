# Capitaine Web Cursor

[English](README.md) | [简体中文](README.zh-CN.md)

A desktop Chrome extension that replaces ten special CSS `cursor` values with Capitaine Cursors artwork.

Includes Light / Dark SVGs, with Auto following the browser's color scheme. Import your own SVG, PNG or CUR files and calibrate their hotspots visually. The interface is available in English and Simplified Chinese, following the browser's UI language.

The extension works within web pages. Chrome's tabs, address bar and menus keep their original cursors.

## Supported cursors

| `cursor` value | Meaning |
| --- | --- |
| `grab` | Ready to grab |
| `grabbing` | Grabbing |
| `zoom-in` | Zoom in |
| `zoom-out` | Zoom out |
| `cell` | Select a cell |
| `vertical-text` | Vertical text |
| `alias` | Create an alias |
| `copy` | Copy |
| `col-resize` | Resize a column |
| `row-resize` | Resize a row |

Regular arrows, link pointers and text cursors keep their existing appearance. Website-provided image cursors and `cursor: none` are always preserved.

## Installation

Requires Chrome 120 or later. Download and extract the Release ZIP, or build from source. Building requires Node.js 24 or later. Run in the project directory:

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose the extracted directory, or `dist` if building from source.
3. Refresh the web pages where you want to use the extension.

After updating the source, rebuild, reload the extension and refresh your pages.

Cursor replacement is unavailable on browser-internal pages and the Chrome Web Store.

## Preview

Try the samples on [Cursor Test](https://vibhorjaiswal.github.io/Cursor-Test/). Compare appearances using the extension switch and Light / Dark modes.

## Custom cursors

Open the full settings page to replace images or calibrate hotspots under **Cursor resources**. Configure Light / Dark separately or use the same image for both.

A hotspot is the point in the cursor image aligned with the click position. Adjust it on the enlarged canvas and check the actual click location in the trial area. CUR files use their embedded hotspots by default.

Files must be no larger than 256 KiB. SVGs must be static and self-contained. PNGs can be up to 128×128 px, and CUR files must contain at least one image within that size.

Some websites block imported images through their Content Security Policy (CSP). Those pages fall back to built-in cursors without deleting your saved configuration.

## Recommended Windows setup

Use the matching Windows cursor theme for a consistent appearance across regular and special cursors.

| Project | Purpose |
| --- | --- |
| [Capitaine Cursors](https://github.com/keeferrourke/capitaine-cursors) | Original artwork and SVG sources |
| [Capitaine Cursors for Windows 11 HiDPI](https://github.com/hervad/capitaine-cursors-w11-hidpi) | Third-party Windows port with Light / Dark and multiple HiDPI sizes |
| [Auto Dark Mode](https://github.com/AutoDarkMode/Windows-Auto-Night-Mode) | Automatically switches Windows appearance and the corresponding cursor scheme |

1. Install the Windows Light / Dark cursor schemes.
2. Enable cursor switching in Auto Dark Mode and select the matching scheme for each mode.
3. Set Chrome to follow the system appearance and this extension to Auto.

## Permissions and data

The extension uses website access to identify and replace cursors. Settings and images are stored locally in the current browser. There are no external services, synchronization or analytics.

## Development

```sh
npm run setup:browser  # Prepare the test browser on first use
npm test               # Run all checks
npm run demo           # Start the local test page
```

## Future direction

The same customization tools may be extended to more standard CSS `cursor` values for a more complete set of web cursors.

## License

The extension code, tests, build scripts and documentation are licensed under MIT.

The bundled Capitaine Cursors artwork is by Keefer Rourke and contributors, licensed under LGPL-3.0-or-later.
