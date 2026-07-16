<div align="center">

# Developer Vault

**A local Chrome debugging extension for capturing API calls, storage, WebSockets, page sources, JWTs, cURL commands, and HAR exports.**

<p>
  <a href="https://github.com/amanranjan26262626-creator/Developer-Vault/archive/refs/heads/main.zip">
    <img alt="Download ZIP" src="https://img.shields.io/badge/Download-ZIP-2ea44f?style=for-the-badge&logo=github" />
  </a>
  <a href="https://github.com/amanranjan26262626-creator/Developer-Vault">
    <img alt="View Repository" src="https://img.shields.io/badge/View-Repository-0969da?style=for-the-badge&logo=github" />
  </a>
  <a href="https://github.com/amanranjan26262626-creator/Developer-Vault/issues">
    <img alt="Report Issue" src="https://img.shields.io/badge/Report-Issue-d73a49?style=for-the-badge&logo=github" />
  </a>
</p>

<p>
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" />
  <img alt="Local First" src="https://img.shields.io/badge/Local--First-No%20Server-6f42c1" />
  <img alt="JavaScript" src="https://img.shields.io/badge/Built%20with-JavaScript-f1e05a" />
  <img alt="Status" src="https://img.shields.io/badge/Status-Manual%20Install-orange" />
</p>

</div>

## Overview

Developer Vault is a browser-side developer utility for inspecting web applications during debugging, QA, and authorized testing. It runs locally as a Chrome extension and helps collect useful technical evidence from the current browser session without requiring a backend server.

This repository currently supports manual installation through Chrome's **Load unpacked** flow. It is not published on the Chrome Web Store yet.

## What It Captures

| Area | Description |
| --- | --- |
| Network activity | Capture API calls and request/response details from active pages. |
| WebSockets | Inspect WebSocket traffic during real-time app testing. |
| Storage | Review local storage, session storage, cookies-related browser data surfaces where available, and IndexedDB-oriented data. |
| Page sources | Collect page source and related frontend assets for debugging. |
| JWT tools | Decode JWT payloads locally for quick inspection. |
| Export tools | Generate cURL and HAR-style exports for sharing reproducible debugging evidence. |

## Key Features

- Local Chrome extension powered by Manifest V3.
- API capture for frontend and backend debugging workflows.
- WebSocket capture support for real-time applications.
- Storage inspection tools for app-state troubleshooting.
- JWT decoder for quick token payload review.
- cURL and HAR export options for reproducible reports.
- No hosted backend required for the current build.

## Installation

### Option 1: Download From GitHub

1. Open the repository: [Developer Vault](https://github.com/amanranjan26262626-creator/Developer-Vault)
2. Click **Code**.
3. Click **Download ZIP**.
4. Extract the downloaded ZIP file.
5. Open Chrome and go to:

```text
chrome://extensions/
```

6. Turn on **Developer mode**.
7. Click **Load unpacked**.
8. Select the extracted folder that contains `manifest.json`.
9. Pin **Developer Vault** from the Chrome extensions menu.

### Option 2: Clone The Repository

```bash
git clone https://github.com/amanranjan26262626-creator/Developer-Vault.git
```

Then load the cloned folder from `chrome://extensions/` using **Load unpacked**.

## Usage

1. Open the web application you want to inspect.
2. Click the **Developer Vault** extension icon.
3. Use the available panels to inspect API calls, storage, sources, JWTs, cURL output, and HAR exports.
4. Export the required evidence when you need to share debugging details with a developer, QA engineer, or security tester.

## Required Permissions

Developer Vault requests powerful Chrome permissions because it is designed for debugging and inspection.

| Permission | Why it is needed |
| --- | --- |
| `debugger` | Required for deeper browser debugging and traffic inspection workflows. |
| `activeTab` | Allows the extension to work with the currently selected tab. |
| `tabs` | Helps identify and manage the inspected browser tab. |
| `storage` | Saves extension-side settings and captured state locally. |
| `downloads` | Supports exporting captured data. |
| `<all_urls>` | Allows inspection across different websites during development and testing. |

Only install this extension if you understand these permissions.

## Repository Structure

```text
Developer-Vault/
├── background.js    # Extension service worker and capture logic
├── manifest.json    # Chrome Manifest V3 configuration
├── popup.html       # Extension popup interface
├── popup.js         # Popup UI logic and tools
├── jszip.min.js     # ZIP/export helper library
└── README.md        # Project documentation
```

## Current Status

- Manual Chrome installation is supported.
- Chrome Web Store publishing is not configured yet.
- Release packaging can be added later for cleaner public downloads.

## Roadmap

- Add GitHub release ZIP packages.
- Add screenshots and demo GIFs.
- Add a dedicated privacy policy page.
- Prepare Chrome Web Store listing assets.
- Add versioned changelog entries.

## Responsible Use

Use Developer Vault only on websites, applications, and accounts you own or have permission to test. Do not use it to collect private data, credentials, tokens, or traffic from other users without authorization.

## Support

If something is not working, open an issue here:

[Report an issue](https://github.com/amanranjan26262626-creator/Developer-Vault/issues)

## License

No license file has been added yet. Add a license before distributing this project widely.
