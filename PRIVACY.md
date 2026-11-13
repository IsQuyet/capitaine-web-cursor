# Privacy Policy

Effective date: November 13, 2026

Capitaine Web Cursor replaces selected CSS cursors on web pages and lets you configure cursor images and hotspots.

## Data the extension handles

- Settings, including enabled state, color mode and excluded hostnames.
- Images you choose to import, their filenames, hotspots and Light / Dark bindings.
- The current page or frame's hostname and computed cursor style, used to determine whether and how to apply a cursor.
- The current mouse position and target element, held in memory while handling that document.

Settings and imported images are stored in `chrome.storage.local`, in your current browser profile. Mouse positions and target elements are not saved to storage, and the extension does not keep a browsing history.

When an imported image is applied to a page, its data URL becomes part of the computed cursor style and may be readable by scripts on that page.

## Transmission and use

The extension has no server, analytics or advertising integrations. It does not upload settings, imported files or browsing activity to the developer, sell user data, or use it for advertising. Settings are not synchronized between browsers or devices by the extension.

## Permissions

- Website access on HTTP and HTTPS pages: identify cursor styles and apply replacements, including within frames.
- `scripting`: insert and remove cursor CSS rules.
- `storage`: save settings and custom cursor resources locally.

## Retention and removal

Local settings and images remain until you change or remove them, clear the extension's local storage, or uninstall the extension. The extension has no developer-held copy of that data.

## Contact

For questions about this policy, contact IsQuyet through this repository's GitHub issue tracker.
