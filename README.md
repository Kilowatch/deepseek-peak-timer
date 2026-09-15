# 🕒 DeepSeek Peak / Off-Peak Price Timer

> An always-on-top desktop price clock for **Windows and Linux** that tracks DeepSeek API peak and off-peak billing in real time.

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-0078d7.svg)](https://www.electronjs.org/)
[![Electron](https://img.shields.io/badge/Electron-34.x-47848F.svg)](https://electronjs.org)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://github.com/Kilowatch/deepseek-peak-timer?tab=readme-ov-file#GPL-3.0-1-ov-file)
[![GitHub release](https://img.shields.io/github/v/release/Kilowatch/deepseek-peak-timer?include_prereleases&color=emerald)](https://github.com/Kilowatch/deepseek-peak-timer/releases)

---

## ⚡ Downloads

Release builds need no Node.js installation:

- **Windows:** download the portable `DeepSeekPriceClock.exe`.
- **Linux:** download the `DeepSeekPriceClock-<version>-x86_64.AppImage` release asset, make it executable, then run it.

See the [latest release assets](https://github.com/Kilowatch/deepseek-peak-timer/releases/latest).

## 📸 Screenshots

| Full Expanded Dashboard | Floating Mini Bar (with Header & Countdown) |
| :---: | :---: |
| ![Full Dashboard](docs/screenshots/full-dashboard.png) | ![Floating Mini Bar](docs/screenshots/mini-bar.png) |

---

## ✨ Features

- 🟢 **Live Status Indicators**:
  - **Green Glowing Dot**: Off-Peak is active (**50% Discount** applies to all API calls).
  - **Red Glowing Dot**: Peak rates active (standard pricing).
- ⏱️ **Real-Time Monospace Countdown**: Live ticking `HH:MM:SS` showing exact time remaining in the current pricing window.
- 🌍 **Automatic Local Timezone Detection**: Automatically detects your system timezone (e.g. `Africa/Johannesburg · GMT+2`) and maps the fixed UTC pricing schedule to your local clock, with a 1-click toggle to UTC.
- 📊 **24-Hour Timeline Visualizer**: Color-coded 24-hour track (Green = Off-Peak, Red = Peak) with a real-time glowing needle marker.
- 📅 **Upcoming Pricing Schedule Table**: Lists upcoming transitions with local time ranges, active duration, and time remaining.
- 💰 **DeepSeek V4 Pricing Cards**: live peak/off-peak values for `deepseek-v4-flash`, `deepseek-v4-pro`, and `deepseek-v4-flash-vision-exp`, including cache-hit, cache-miss, and output billing.
- 🧮 **Cost Calculator**: compare cache-hit, cache-miss, and output-token costs at peak versus off-peak prices.
- 📈 **Private Usage & Budget Tools**: import/export local usage estimates, set a monthly budget, and optionally check balance with an OS-encrypted API key.
- 📡 **API-Driven Peak/Off-Peak Ratio**: opt-in localhost proxy records only completion timestamp, model, and token-usage metadata for non-streaming requests—never prompts or responses—and shows peak versus off-peak token/cost ratios.
- 🔔 **Configurable Feedback**: opt-in transition and advance alerts, quiet hours, notification history, and official-pricing verification.
- 📌 **Always-On-Top & Freely Draggable**: Pin it anywhere on screen so it floats above your IDE, browser, or terminal.
- 🗖 **Multi-Mode Views**:
  1. **Floating Mini Bar**: Ultra-compact bar with `DEEPSEEK PEAK TIMER` header, status dot, live countdown timer, and `-50%` badge.
  2. **Full Expanded Dashboard**: Detailed schedule, rates, 24h timeline, and timezone controls.
  3. **System Tray Mode**: Hides to the system tray with a native green/red icon and live tooltip.
- 🔔 **Desktop Notifications**: Optional toast alert when price windows switch (e.g. *"50% discount is now active!"*).

---

## ⏰ DeepSeek Pricing Schedule (UTC)

DeepSeek API uses fixed UTC peak/off-peak hours on weekdays. From **August 23, 2026 at 00:00 Beijing time**, every Saturday and Sunday (Beijing time) is billed at the off-peak rate all day. Off-peak rates are half the peak rate. The bundled catalogue is based on the [official pricing page](https://api-docs.deepseek.com/quick_start/pricing/) effective August 16, 2026.

| Window | UTC Time Range | Status | Rate Discount |
| :--- | :--- | :---: | :---: |
| **Night Window** | `00:00 – 01:00 UTC` | 🟢 **Off-Peak** | **50% OFF** |
| **Morning Peak** | `01:00 – 04:00 UTC` | 🔴 **Peak** | Standard Price |
| **Mid-Day Window** | `04:00 – 06:00 UTC` | 🟢 **Off-Peak** | **50% OFF** |
| **Afternoon Peak** | `06:00 – 10:00 UTC` | 🔴 **Peak** | Standard Price |
| **Evening Window** | `10:00 – 24:00 UTC` | 🟢 **Off-Peak** | **50% OFF** |

On weekends in Beijing time, the full 24 hours are off-peak.

---

## 🆕 What's New in v1.3.0

- **Beijing-weekend billing:** from August 23, 2026 at 00:00 Beijing time, all Saturday and Sunday API usage is classified and priced as off-peak.
- **Accurate countdowns and windows:** the timer, upcoming-window table, and weekend timeline now skip weekend peak periods.
- **Consistent usage monitoring:** locally recorded proxy usage applies the same weekend rule when calculating peak/off-peak costs.
- **Cross-platform distribution:** documentation and packaging cover portable Windows builds plus Linux AppImage, DEB, and RPM builds.

---

## 🚀 Getting Started

### Method 1: Run a Release Build (Recommended)

**Windows**

1. Download `DeepSeekPriceClock.exe` from the [latest release](https://github.com/Kilowatch/deepseek-peak-timer/releases/latest).
2. Double-click it to run. You can move it to your Desktop, startup folder, or USB drive.

**Linux**

1. Download the AppImage from the [latest release](https://github.com/Kilowatch/deepseek-peak-timer/releases/latest).
2. Make it executable and run it:

   ```bash
   chmod +x DeepSeekPriceClock-*-x86_64.AppImage
   ./DeepSeekPriceClock-*-x86_64.AppImage
   ```

---

### Method 2: Run from Source
1. **Clone the repository**:
   ```bash
   git clone https://github.com/Kilowatch/deepseek-peak-timer.git
   cd deepseek-peak-timer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application**:
   ```bash
   npm start
   ```
   *(On Windows, you can also double-click `start.bat`.)*

### Method 3: Build Distribution Packages

**Windows portable executable**

```bash
npm run build:standalone
```

This creates `Standalone/DeepSeekPriceClock.exe`.

**Linux AppImage**

```bash
npm run build:linux
chmod +x Standalone/DeepSeekPriceClock-*.AppImage
./Standalone/DeepSeekPriceClock-*.AppImage
```

`npm run build:linux:deb` and `npm run build:linux:rpm` produce optional native packages. Linux packages include a freedesktop `.desktop` launcher for application-menu integration. On Wayland, the desktop compositor controls window placement because Wayland does not permit applications to set global screen coordinates. Enable **Start Automatically on Login** from the tray or window context menu to create a user-level autostart entry.

---

## 🎮 Window Controls & Shortcuts

| Button / Action | Description |
| :--- | :--- |
| **`[📌]` Pin** | Toggle Always-On-Top mode |
| **`[—]` Minimize Bar** | Minimize to compact Floating Mini Bar with live countdown |
| **`[⌄]` Minimize Tray** | Minimize or hide directly into the system tray |
| **`[↗]` Expand** | Expand from Mini Bar to Full Dashboard |
| **`[✕]` Exit** | Completely exit and close the application |
| **Right-Click Anywhere** | Opens the context menu (switch modes, toggle pin, or exit) |
| **Double-Click Mini Bar** | Instantly expands to Full Dashboard |

---

## 📁 Repository Structure

```
deepseek-peak-timer/
├── Standalone/
│   ├── DeepSeekPriceClock.exe    # Windows portable executable
│   └── DeepSeekPriceClock-*.AppImage # Linux portable application
├── docs/
│   └── screenshots/              # GitHub README preview images
│       ├── full-dashboard.png
│       └── mini-bar.png
├── src/
│   ├── index.html                # App layout & views (Mini Bar + Dashboard)
│   ├── js/
│   │   ├── app.js                # UI controller, countdown ticker, mode switcher
│   │   └── calculator.js         # UTC schedule math & auto timezone engine
│   ├── styles/
│   │   └── main.css              # Modern acrylic glassmorphism & dark theme styles
│   └── assets/
│       └── icons/                # Multi-resolution ICO & PNG tray and app icons
├── main.js                       # Electron main process (tray, window management, IPC)
├── preload.js                    # Secure context bridge IPC
├── package.json                  # Project manifest & build scripts
├── start.bat                     # Windows quick launcher
├── LICENSE                       # GNU General Public License v3.0
└── README.md                     # Documentation
```

---

## 📄 License

This project is licensed under the **[GPL-3.0 License](https://github.com/Kilowatch/deepseek-peak-timer?tab=readme-ov-file#GPL-3.0-1-ov-file)** - see the [LICENSE](LICENSE) file for details.
