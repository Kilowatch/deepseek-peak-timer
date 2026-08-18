# DeepSeek Peak / Off-Peak Floating Price Clock

A sleek, always-on-top desktop floating bar and status widget for Windows that tracks the **DeepSeek API 50% discount off-peak hours** in real time.

Replicates the functionality of [DeepakNess DeepSeek Price Clock](https://deepakness.com/deepseek/) directly on your Windows desktop.

---

## Features

- 🟢 **Live Status Indicator**:
  - **Green Dot / Glowing Badge**: Off-Peak is active (**50% Discount** on all API calls).
  - **Red Dot / Glowing Badge**: Peak pricing is active.
- 🕒 **Live Monospace Countdown**: Shows exact `HH:MM:SS` remaining in the current pricing window.
- 🌍 **Auto Local Timezone Detection**: Automatically resolves your local timezone (e.g. `Africa/Johannesburg (GMT+2)`) and maps the UTC transition windows directly to your local clock, with a 1-click toggle to UTC.
- 📊 **24-Hour Schedule Timeline**: Color-coded 24h timeline track (Green = Off-Peak, Red = Peak) with a real-time glowing needle marker.
- 📅 **Upcoming Pricing Schedule Table**: Lists upcoming transitions with local time ranges and durations.
- 💰 **Live Model Rates Card**: Shows current and discounted rates for DeepSeek V3 (Chat) and DeepSeek R1 (Reasoner).
- 📌 **Always on Top & Draggable**: Pin it anywhere on screen so it stays above your code editor, browser, or terminal.
- 🔘 **Three Window Modes**:
  1. **Expanded Dashboard**: Full details, timeline, rates, and schedule.
  2. **Compact Pill Bar**: `[ 🟢 02:45:18 · -50% ]`
  3. **Floating Status Dot**: Ultra-compact 48px glowing dot (Green = Off-Peak, Red = Peak). Click anywhere to expand!
- 🔔 **System Tray & Desktop Alerts**: Tray icon dynamically reflects green/red status; notifies you when the 50% discount window starts.

---

## How to Launch

### Option 1: Double-click `start.bat`
Simply double-click the `start.bat` file in this folder.

### Option 2: Terminal
```bash
cd F:\Share\Deepseek
npm start
```

---

## DeepSeek Pricing Windows (Fixed UTC)
- **Peak Hours (Standard Price)**:
  - `01:00 UTC – 04:00 UTC`
  - `06:00 UTC – 10:00 UTC`
- **Off-Peak Hours (50% Off / Half Price)**:
  - `00:00 UTC – 01:00 UTC`
  - `04:00 UTC – 06:00 UTC`
  - `10:00 UTC – 24:00 UTC`
