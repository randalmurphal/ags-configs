# AGS Configuration Refactoring Plan

## Executive Summary

This plan outlines the modular refactoring of a 1513-line monolithic `app.tsx` file into a maintainable, feature-organized codebase. The refactor preserves all existing functionality while enabling easier extension and maintenance.

**Key Goals:**
1. Split monolithic file into logical feature modules
2. Extract shared utilities and constants
3. Organize popups by feature domain
4. Maintain zero functional changes
5. Enable parallel development of features

---

## Current State Analysis

### Existing Files

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `app.tsx` | 1513 | Monolithic | **Split into modules** |
| `launcher.tsx` | 282 | Well-contained | **Keep as-is** |
| `widget/Bar.tsx` | 131 | Unused | **Delete** |
| `style.scss` | ~400 | Monolithic | **Split by feature** |

### What's in app.tsx

**Bar Components (Lines 1-137):**
- Workspaces widget (per-monitor filtering)
- Clients widget (window icons)
- Clock widget (time + date)

**Popup Management System (Lines 139-197):**
- Global popup state (`POPUP_NAMES`)
- `closeAllPopups()`, `togglePopup()` functions
- `PopupBackdrop` component (click-outside-to-close)

**Audio System (Lines 199-339):**
- `AudioPopup` with volume slider, mute button
- `Audio` tray button with volume icon

**Brightness System (Lines 341-578):**
- Software brightness state management
- Night light with auto sunrise/sunset calculation
- Astronomical formula for sun times (location-aware)
- `BrightnessPopup` with slider + night light controls
- `Brightness` tray button

**WiFi System (Lines 580-1075):**
- nmcli integration for network management
- Network scanning with polling
- Password dialog for secured networks
- Saved network management (connect/forget)
- `WifiPopup` with network list
- `Network` tray button with signal strength

**Bluetooth System (Lines 1076-1386):**
- bluetoothctl integration
- Paired device management
- Device type icons (headphones, mouse, etc.)
- `BluetoothPopup` with device list
- `Bluetooth` tray button with status

**Caffeine Toggle (Lines 1077-1108):**
- systemd-inhibit integration
- State persistence via `/tmp` file

**Main Components (Lines 1387-1512):**
- `SystemTray` composite
- `Bar` per-monitor setup
- App initialization with request handler

### Shared Concerns (Need Extraction)

1. **Popup Management:**
   - State tracking (visible/hidden)
   - Backdrop coordination
   - Close-on-escape logic
   - Toggle behavior

2. **System Integration:**
   - nmcli (WiFi)
   - bluetoothctl (Bluetooth)
   - systemd-inhibit (Caffeine)
   - GLib spawn/file operations

3. **UI Patterns:**
   - Toggle buttons (ON/OFF with active state)
   - Sliders with live updates
   - Dynamic refresh on visibility
   - Escape key handling

4. **Constants:**
   - Workspace-to-monitor mapping
   - Location coordinates (lat/lon)
   - Icon mappings (device types, signal strength)

---

## Proposed Directory Structure

```
/home/randy/.config/ags/
├── app.tsx                      # App initialization only (50 lines)
├── launcher.tsx                 # Keep as-is
├── tsconfig.json
├── package.json
│
├── lib/                         # Shared utilities
│   ├── popup-manager.ts         # Popup state management
│   ├── system-commands.ts       # GLib spawn wrappers
│   ├── constants.ts             # All constant values
│   └── ui-components.ts         # Reusable UI patterns (toggle buttons, etc.)
│
├── widgets/                     # Reusable widget components
│   ├── bar/
│   │   ├── index.tsx            # Bar component (orchestrator)
│   │   ├── Workspaces.tsx       # Workspace buttons
│   │   ├── Clients.tsx          # Client icons
│   │   └── Clock.tsx            # Time/date display
│   │
│   ├── system-tray/
│   │   ├── index.tsx            # SystemTray composite
│   │   ├── Audio.tsx            # Audio button
│   │   ├── Brightness.tsx       # Brightness button
│   │   ├── Network.tsx          # WiFi button
│   │   ├── Bluetooth.tsx        # Bluetooth button
│   │   └── Caffeine.tsx         # Caffeine toggle button
│   │
│   └── popups/
│       ├── backdrop.tsx         # PopupBackdrop component
│       ├── audio/
│       │   └── AudioPopup.tsx   # Audio controls popup
│       ├── brightness/
│       │   ├── BrightnessPopup.tsx       # Brightness controls
│       │   └── night-light.ts            # Sunrise/sunset calculations
│       ├── network/
│       │   ├── WifiPopup.tsx             # WiFi network list
│       │   └── network-utils.ts          # nmcli parsing
│       └── bluetooth/
│           ├── BluetoothPopup.tsx        # Bluetooth device list
│           └── bluetooth-utils.ts        # bluetoothctl parsing
│
└── styles/                      # Modular styles
    ├── index.scss               # Main import (combines all)
    ├── _variables.scss          # Color palette, shared values
    ├── _mixins.scss             # popup-base, smooth-button, etc.
    ├── bar.scss                 # Bar-specific styles
    ├── launcher.scss            # Launcher styles
    ├── system-tray.scss         # System tray button styles
    └── popups/
        ├── _shared.scss         # Shared popup patterns
        ├── audio.scss
        ├── brightness.scss
        ├── network.scss
        └── bluetooth.scss
```

**Total New Files:** ~30 files (from 4 files currently)

---

## File Specifications

### 1. Core Application

#### `app.tsx` (New - ~50 lines)
**Responsibility:** App initialization and request handler only

```typescript
import app from "ags/gtk4/app"
import style from "./styles/index.scss"
import Bar from "./widgets/bar"
import { toggleLauncher, Launcher } from "./launcher"
import PopupBackdrop from "./widgets/popups/backdrop"
import AudioPopup from "./widgets/popups/audio/AudioPopup"
import BrightnessPopup from "./widgets/popups/brightness/BrightnessPopup"
import WifiPopup from "./widgets/popups/network/WifiPopup"
import BluetoothPopup from "./widgets/popups/bluetooth/BluetoothPopup"

// Export for ags toggle launcher
;(globalThis as any).toggleLauncher = toggleLauncher

app.start({
  css: style,
  requestHandler(request: string, res: (response: any) => void) {
    if (request === "toggle-launcher") {
      toggleLauncher()
      res("ok")
    } else {
      res("unknown command")
    }
  },
  main() {
    const monitors = app.get_monitors()
    print(`Found ${monitors.length} monitors`)
    return [
      ...monitors.map((monitor: Gdk.Monitor) => <Bar monitor={monitor} />),
      <PopupBackdrop />,
      <AudioPopup />,
      <BrightnessPopup />,
      <WifiPopup />,
      <BluetoothPopup />,
      Launcher(),
    ]
  },
})
```

**Exports:** None (entry point)
**Imports:** All top-level components

---

### 2. Shared Libraries

#### `lib/constants.ts` (~80 lines)
**Responsibility:** All constant values in one place

```typescript
// Workspace-to-monitor mapping (from hyprland.conf)
export const WORKSPACE_MONITOR_MAP: Record<string, number[]> = {
  "DP-3": [1, 2, 3, 10],      // Center (primary)
  "DP-1": [4, 5, 6],          // Left
  "HDMI-A-1": [7, 8, 9],      // Right
}

// Location for sunrise/sunset calculation (Austin, TX area)
export const LATITUDE = 30.27   // degrees North
export const LONGITUDE = -97.74 // degrees West

// Popup window names
export const POPUP_NAMES = [
  "audio-popup",
  "brightness-popup",
  "wifi-popup",
  "bluetooth-popup",
] as const

// Icon mappings
export function getVolumeIcon(volume: number, muted: boolean): string {
  if (muted) return "󰖁"
  if (volume > 0.66) return "󰕾"
  if (volume > 0.33) return "󰖀"
  if (volume > 0) return "󰕿"
  return "󰖁"
}

export function getWifiSignalIcon(strength: number): string {
  if (strength >= 80) return "󰤨"
  if (strength >= 60) return "󰤥"
  if (strength >= 40) return "󰤢"
  if (strength >= 20) return "󰤟"
  return "󰤯"
}

export function getBluetoothDeviceIcon(deviceName: string): string {
  const name = deviceName.toLowerCase()
  if (name.includes("headphone") || name.includes("earbuds") ||
      name.includes("buds") || name.includes("airpod")) return "󰋋"
  if (name.includes("keyboard")) return "󰍽"
  if (name.includes("mouse")) return "󰦏"
  if (name.includes("controller") || name.includes("gamepad")) return "󰊴"
  if (name.includes("speaker")) return "󰓃"
  return "󰂱"
}

export function getMonitorWorkspaces(monitorName: string): number[] {
  return WORKSPACE_MONITOR_MAP[monitorName] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
}
```

**Exports:** Constants, icon mapping functions, workspace utilities
**Imports:** None (pure constants)

---

#### `lib/popup-manager.ts` (~60 lines)
**Responsibility:** Centralized popup state management

```typescript
import app from "ags/gtk4/app"
import { POPUP_NAMES } from "./constants"

export function closeAllPopups(): void {
  POPUP_NAMES.forEach(name => {
    const popup = app.get_window(name)
    if (popup && popup.visible) popup.visible = false
  })

  // Hide backdrop
  const backdrop = app.get_window("popup-backdrop")
  if (backdrop) backdrop.visible = false
}

export function togglePopup(name: string): void {
  const popup = app.get_window(name)
  if (!popup) return

  const wasVisible = popup.visible

  // Close all popups first
  closeAllPopups()

  // If it wasn't visible, open it with backdrop
  if (!wasVisible) {
    const backdrop = app.get_window("popup-backdrop")
    if (backdrop) backdrop.visible = true
    popup.visible = true
  }
}

export function isPopupOpen(name: string): boolean {
  const popup = app.get_window(name)
  return popup?.visible ?? false
}
```

**Exports:** `closeAllPopups`, `togglePopup`, `isPopupOpen`
**Imports:** `app`, `POPUP_NAMES`

---

#### `lib/system-commands.ts` (~40 lines)
**Responsibility:** Wrappers for GLib system operations

```typescript
import GLib from "gi://GLib"

export function spawnAsync(command: string): void {
  GLib.spawn_command_line_async(command)
}

export function spawnSync(command: string): [boolean, Uint8Array] {
  return GLib.spawn_command_line_sync(command)
}

export function fileExists(path: string): boolean {
  return GLib.file_test(path, GLib.FileTest.EXISTS)
}

export function touchFile(path: string): void {
  spawnAsync(`touch ${path}`)
}

export function removeFile(path: string): void {
  spawnAsync(`rm -f ${path}`)
}

export function getHomeDir(): string {
  return GLib.get_home_dir()
}

export function formatTime(decimalHour: number): string {
  const hour = Math.floor(decimalHour)
  const minutes = Math.round((decimalHour - hour) * 60)
  const ampm = hour >= 12 ? "PM" : "AM"
  const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${ampm}`
}
```

**Exports:** System command wrappers, file utilities, time formatting
**Imports:** `GLib`

---

#### `lib/ui-components.ts` (~80 lines)
**Responsibility:** Reusable UI patterns (toggle buttons, escape handlers)

```typescript
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import Astal from "gi://Astal?version=4.0"
import { closeAllPopups } from "./popup-manager"

export function createToggleButton(
  initialState: boolean,
  onToggle: (state: boolean) => void
): Gtk.Button {
  const btn = new Gtk.Button()
  btn.add_css_class("toggle-btn")
  if (initialState) btn.add_css_class("active")

  const label = new Gtk.Label({ label: initialState ? "ON" : "OFF" })
  btn.set_child(label)

  btn.connect("clicked", () => {
    const newState = !btn.has_css_class("active")
    if (newState) {
      btn.add_css_class("active")
      label.label = "ON"
    } else {
      btn.remove_css_class("active")
      label.label = "OFF"
    }
    onToggle(newState)
  })

  return btn
}

export function addEscapeHandler(window: Astal.Window): void {
  const keyController = new Gtk.EventControllerKey()
  keyController.connect("key-pressed", (_ctrl: any, keyval: number) => {
    if (keyval === Gdk.KEY_Escape) {
      closeAllPopups()
      return true
    }
    return false
  })
  window.add_controller(keyController)
}

export function createVolumeSlider(
  initialValue: number,
  onChange: (value: number) => void
): Gtk.Scale {
  const scale = new Gtk.Scale({
    orientation: Gtk.Orientation.HORIZONTAL,
    drawValue: false,
    hexpand: true,
  })
  scale.set_range(0, 100)
  scale.set_increments(1, 5)
  scale.add_css_class("volume-slider")
  scale.set_value(initialValue)

  let updatingFromBinding = false

  // Handle user input
  scale.connect("value-changed", () => {
    if (!updatingFromBinding) {
      onChange(scale.get_value())
    }
  })

  return scale
}
```

**Exports:** UI component factories, event handlers
**Imports:** GTK, Astal, popup-manager

---

### 3. Bar Widgets

#### `widgets/bar/index.tsx` (~50 lines)
**Responsibility:** Orchestrate bar layout per monitor

```typescript
import app from "ags/gtk4/app"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import Workspaces from "./Workspaces"
import Clients from "./Clients"
import Clock from "./Clock"
import SystemTray from "../system-tray"

export default function Bar({ monitor }: { monitor: Gdk.Monitor }) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor
  const monitorName = monitor.connector || "unknown"

  return (
    <window
      visible
      namespace={`ags-bar-${monitorName}`}
      name={`bar-${monitorName}`}
      cssClasses={["Bar"]}
      gdkmonitor={monitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox cssClasses={["centerbox"]}>
        <box $type="start" halign={Gtk.Align.START}>
          <Workspaces monitorName={monitorName} />
          <Clients monitorName={monitorName} />
        </box>
        <box $type="center">
          <Clock />
        </box>
        <box $type="end" halign={Gtk.Align.END}>
          <SystemTray />
        </box>
      </centerbox>
    </window>
  )
}
```

**Exports:** `Bar` component
**Imports:** Bar widgets, SystemTray

---

#### `widgets/bar/Workspaces.tsx` (~45 lines)
**Responsibility:** Display workspace buttons for current monitor

```typescript
import { createBinding, For } from "ags"
import AstalHyprland from "gi://AstalHyprland"
import { getMonitorWorkspaces } from "../../lib/constants"

export default function Workspaces({ monitorName }: { monitorName: string }) {
  const hypr = AstalHyprland.get_default()
  const workspaces = createBinding(hypr, "workspaces")
  const focused = createBinding(hypr, "focusedWorkspace")
  const monitorWorkspaceIds = getMonitorWorkspaces(monitorName)

  const filteredWorkspaces = workspaces((wss: any[]) =>
    wss
      .filter((ws) => monitorWorkspaceIds.includes(ws.id))
      .sort((a, b) => a.id - b.id)
  )

  return (
    <box cssClasses={["workspaces"]}>
      <For each={filteredWorkspaces}>
        {(ws: any) => (
          <button
            cssClasses={focused((fw: any) =>
              fw?.id === ws.id ? ["active"] : ws.get_clients().length > 0 ? ["occupied"] : []
            )}
            onClicked={() => hypr.dispatch("workspace", String(ws.id))}
          >
            <label label={String(ws.id)} />
          </button>
        )}
      </For>
    </box>
  )
}
```

**Exports:** `Workspaces` component
**Imports:** Hyprland bindings, `getMonitorWorkspaces`

---

#### `widgets/bar/Clients.tsx` (~55 lines)
**Responsibility:** Show icons for windows on active workspace

```typescript
import { createBinding, For } from "ags"
import AstalHyprland from "gi://AstalHyprland"
import GioUnix from "gi://GioUnix"
import Gio from "gi://Gio"

function getIconForClass(appClass: string): Gio.Icon | null {
  if (!appClass) return null

  const candidates = [
    `${appClass}.desktop`,
    `${appClass.toLowerCase()}.desktop`,
    `${appClass.replace(/\./g, "-")}.desktop`,
    `${appClass.toLowerCase().replace(/\./g, "-")}.desktop`,
  ]

  for (const id of candidates) {
    const appInfo = GioUnix.DesktopAppInfo.new(id)
    if (appInfo) {
      const icon = appInfo.get_icon()
      if (icon) return icon
    }
  }

  return Gio.ThemedIcon.new(appClass.toLowerCase())
}

export default function Clients({ monitorName }: { monitorName: string }) {
  const hypr = AstalHyprland.get_default()
  const clients = createBinding(hypr, "clients")
  const focused = createBinding(hypr, "focusedClient")

  const monitorClients = clients((cls: any[]) => {
    const hyprMonitor = hypr.get_monitors().find((m: any) => m.name === monitorName)
    if (!hyprMonitor) return []
    const activeWsId = hyprMonitor.activeWorkspace?.id
    if (!activeWsId) return []
    return cls.filter((c) => c.workspace?.id === activeWsId).slice(0, 8)
  })

  return (
    <box cssClasses={["clients"]}>
      <For each={monitorClients}>
        {(client: any) => (
          <button
            cssClasses={focused((fc: any) =>
              fc?.address === client.address ? ["client", "focused"] : ["client"]
            )}
            tooltipText={client.title || client.class}
            onClicked={() => hypr.dispatch("focuswindow", `address:${client.address}`)}
          >
            <image cssClasses={["client-icon"]} gicon={getIconForClass(client.class)} pixelSize={18} />
          </button>
        )}
      </For>
    </box>
  )
}
```

**Exports:** `Clients` component
**Imports:** Hyprland bindings, Gio

---

#### `widgets/bar/Clock.tsx` (~25 lines)
**Responsibility:** Display current time and date

```typescript
import GLib from "gi://GLib"
import { createPoll } from "ags/time"

export default function Clock() {
  const time = createPoll("--:--", 1000, () => {
    const now = GLib.DateTime.new_now_local()
    return now ? now.format("%I:%M %p") || "--:--" : "--:--"
  })

  const date = createPoll("", 60000, () => {
    const now = GLib.DateTime.new_now_local()
    return now ? now.format("%a, %b %d") || "" : ""
  })

  return (
    <box cssClasses={["clock"]}>
      <label cssClasses={["time"]} label={time} />
      <label cssClasses={["date"]} label={date} />
    </box>
  )
}
```

**Exports:** `Clock` component
**Imports:** GLib, `createPoll`

---

### 4. System Tray Widgets

#### `widgets/system-tray/index.tsx` (~25 lines)
**Responsibility:** Composite system tray layout

```typescript
import Audio from "./Audio"
import Brightness from "./Brightness"
import Network from "./Network"
import Bluetooth from "./Bluetooth"
import Caffeine from "./Caffeine"

export default function SystemTray() {
  return (
    <box cssClasses={["systray"]}>
      <Caffeine />
      <Audio />
      <Brightness />
      <Bluetooth />
      <Network />
    </box>
  )
}
```

**Exports:** `SystemTray` component
**Imports:** All tray button components

---

#### `widgets/system-tray/Audio.tsx` (~45 lines)
**Responsibility:** Audio tray button with volume display

```typescript
import { createBinding } from "ags"
import AstalWp from "gi://AstalWp"
import { togglePopup } from "../../lib/popup-manager"
import { getVolumeIcon } from "../../lib/constants"

export default function Audio() {
  const wp = AstalWp.get_default()
  const speaker = wp?.audio?.defaultSpeaker

  if (!speaker) {
    return (
      <button cssClasses={["systray-btn"]}>
        <label cssClasses={["icon"]} label="󰖁" />
      </button>
    )
  }

  const volume = createBinding(speaker, "volume")
  const muted = createBinding(speaker, "mute")

  return (
    <button
      cssClasses={muted((m: boolean) => m ? ["systray-btn", "muted"] : ["systray-btn"])}
      onClicked={() => togglePopup("audio-popup")}
      tooltipText={volume((v: number) => `Volume: ${Math.round(v * 100)}%`)}
    >
      <label
        cssClasses={["icon"]}
        label={volume((v: number) => getVolumeIcon(v, speaker.mute))}
      />
    </button>
  )
}
```

**Exports:** `Audio` component
**Imports:** WirePlumber, popup-manager, constants

---

#### `widgets/system-tray/Brightness.tsx` (~18 lines)
**Responsibility:** Brightness tray button

```typescript
import { togglePopup } from "../../lib/popup-manager"

export default function Brightness() {
  return (
    <button
      cssClasses={["systray-btn"]}
      tooltipText="Brightness (software)"
      onClicked={() => togglePopup("brightness-popup")}
    >
      <label cssClasses={["icon"]} label="󰃟" />
    </button>
  )
}
```

**Exports:** `Brightness` component
**Imports:** popup-manager

---

#### `widgets/system-tray/Network.tsx` (~65 lines)
**Responsibility:** WiFi tray button with status polling

```typescript
import GLib from "gi://GLib"
import { createPoll } from "ags/time"
import { togglePopup } from "../../lib/popup-manager"
import { getWifiSignalIcon } from "../../lib/constants"
import { isWifiEnabled, getCurrentWifiConnection } from "../popups/network/network-utils"

export default function Network() {
  const wifiStatus = createPoll({ enabled: false, connected: false, signal: 0 }, 2000, () => {
    const enabled = isWifiEnabled()
    let connected = false
    let signal = 0

    if (enabled) {
      const connName = getCurrentWifiConnection()
      connected = connName.length > 0

      if (connected) {
        const [ok, stdout] = GLib.spawn_command_line_sync("nmcli -t -f SIGNAL device wifi list")
        if (ok) {
          const output = new TextDecoder().decode(stdout)
          const lines = output.trim().split("\n")
          for (const line of lines) {
            const sig = parseInt(line)
            if (!isNaN(sig) && sig > 0) {
              signal = sig
              break
            }
          }
        }
      }
    }

    return { enabled, connected, signal }
  })

  const getIcon = (status: { enabled: boolean; connected: boolean; signal: number }) => {
    if (!status.enabled) return "󰤭"
    if (!status.connected) return "󰤯"
    return getWifiSignalIcon(status.signal)
  }

  const getTooltip = (status: { enabled: boolean; connected: boolean; signal: number }) => {
    if (!status.enabled) return "WiFi Disabled"
    if (!status.connected) return "WiFi Not Connected"
    return `WiFi ${status.signal}%`
  }

  return (
    <button
      cssClasses={["systray-btn"]}
      tooltipText={wifiStatus(getTooltip)}
      onClicked={() => togglePopup("wifi-popup")}
    >
      <label cssClasses={["icon"]} label={wifiStatus(getIcon)} />
    </button>
  )
}
```

**Exports:** `Network` component
**Imports:** popup-manager, constants, network-utils

---

#### `widgets/system-tray/Bluetooth.tsx` (~55 lines)
**Responsibility:** Bluetooth tray button with status polling

```typescript
import GLib from "gi://GLib"
import { createPoll } from "ags/time"
import { togglePopup } from "../../lib/popup-manager"
import { isBluetoothPowered } from "../popups/bluetooth/bluetooth-utils"

export default function Bluetooth() {
  const btStatus = createPoll({ powered: false, connected: false }, 2000, () => {
    const powered = isBluetoothPowered()
    let connected = false

    if (powered) {
      const [ok, stdout] = GLib.spawn_command_line_sync("bluetoothctl devices Connected")
      if (ok) {
        const output = new TextDecoder().decode(stdout).trim()
        connected = output.length > 0 && output.includes("Device")
      }
    }

    return { powered, connected }
  })

  const getIcon = (status: { powered: boolean; connected: boolean }) => {
    if (!status.powered) return "󰂲"
    if (status.connected) return "󰂱"
    return "󰂯"
  }

  const getTooltip = (status: { powered: boolean; connected: boolean }) => {
    if (!status.powered) return "Bluetooth Off"
    if (status.connected) return "Bluetooth Connected"
    return "Bluetooth On"
  }

  return (
    <button
      cssClasses={["systray-btn"]}
      tooltipText={btStatus(getTooltip)}
      onClicked={() => togglePopup("bluetooth-popup")}
    >
      <label cssClasses={["icon"]} label={btStatus(getIcon)} />
    </button>
  )
}
```

**Exports:** `Bluetooth` component
**Imports:** popup-manager, bluetooth-utils

---

#### `widgets/system-tray/Caffeine.tsx` (~50 lines)
**Responsibility:** Caffeine mode toggle (prevent idle sleep)

```typescript
import Gtk from "gi://Gtk?version=4.0"
import { fileExists, spawnAsync, touchFile, removeFile } from "../../lib/system-commands"

const CAFFEINE_STATE_FILE = "/tmp/ags-caffeine-active"

export default function Caffeine() {
  let caffeineState = fileExists(CAFFEINE_STATE_FILE)

  const btn = new Gtk.Button()
  btn.add_css_class("systray-btn")
  if (caffeineState) btn.add_css_class("active")
  btn.tooltipText = caffeineState ? "Caffeine ON" : "Caffeine OFF"

  const icon = new Gtk.Label({ label: caffeineState ? "󰅶" : "󰛊" })
  icon.add_css_class("icon")
  btn.set_child(icon)

  btn.connect("clicked", () => {
    caffeineState = !caffeineState

    if (caffeineState) {
      btn.add_css_class("active")
      icon.label = "󰅶"
      btn.tooltipText = "Caffeine ON"
      spawnAsync("bash -c 'systemd-inhibit --what=idle --who=ags-caffeine --why=\"Caffeine mode\" sleep infinity &'")
      touchFile(CAFFEINE_STATE_FILE)
    } else {
      btn.remove_css_class("active")
      icon.label = "󰛊"
      btn.tooltipText = "Caffeine OFF"
      spawnAsync("pkill -f 'systemd-inhibit.*ags-caffeine'")
      removeFile(CAFFEINE_STATE_FILE)
    }
  })

  return btn
}
```

**Exports:** `Caffeine` component
**Imports:** system-commands

---

### 5. Popup Widgets

#### `widgets/popups/backdrop.tsx` (~35 lines)
**Responsibility:** Transparent click-catcher for closing popups

```typescript
import app from "ags/gtk4/app"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import { closeAllPopups } from "../../lib/popup-manager"

export default function PopupBackdrop() {
  const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

  const win = (
    <window
      visible={false}
      namespace="ags-popup-backdrop"
      name="popup-backdrop"
      cssClasses={["PopupBackdrop"]}
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      exclusivity={Astal.Exclusivity.IGNORE}
      layer={Astal.Layer.TOP}
      keymode={Astal.Keymode.NONE}
      application={app}
    >
      <box hexpand vexpand />
    </window>
  ) as Astal.Window

  const clickController = new Gtk.GestureClick()
  clickController.connect("released", () => {
    closeAllPopups()
  })
  win.add_controller(clickController)

  return win
}
```

**Exports:** `PopupBackdrop` component
**Imports:** popup-manager

---

#### `widgets/popups/audio/AudioPopup.tsx` (~120 lines)
**Responsibility:** Audio volume control popup

Extracts lines 199-306 from current `app.tsx` with no logic changes.

**Exports:** `AudioPopup` component
**Imports:** WirePlumber, popup-manager, ui-components

---

#### `widgets/popups/brightness/BrightnessPopup.tsx` (~150 lines)
**Responsibility:** Brightness and night light control popup

Extracts lines 454-578 from current `app.tsx`.

**Exports:** `BrightnessPopup` component
**Imports:** night-light module, popup-manager, ui-components, system-commands

---

#### `widgets/popups/brightness/night-light.ts` (~120 lines)
**Responsibility:** Sunrise/sunset calculation and auto night light

Extracts lines 341-453 from current `app.tsx` (pure logic).

```typescript
import GLib from "gi://GLib"
import { LATITUDE, LONGITUDE } from "../../../lib/constants"
import { getHomeDir, spawnAsync, fileExists, touchFile, removeFile } from "../../../lib/system-commands"

const NIGHT_LIGHT_STATE_FILE = "/tmp/ags-nightlight-active"

export let currentBrightnessValue = 100
export let nightLightState = fileExists(NIGHT_LIGHT_STATE_FILE)
export let nightLightAuto = true

// Calculate sunrise/sunset times using astronomical formula
export function calculateSunTimes(): { sunrise: number; sunset: number } {
  // ... existing calculation logic
}

// Cached sun times (recalculated once per day)
let cachedSunTimes = calculateSunTimes()
let lastSunCalcDay = GLib.DateTime.new_now_local()?.get_day_of_year() || 0

export function getSunTimes(): { sunrise: number; sunset: number } {
  // ... existing caching logic
}

export function isNightTime(): boolean {
  // ... existing logic
}

export function formatSunTime(decimalHour: number): string {
  // ... existing formatting logic
}

export function applyNightLight(enabled: boolean): void {
  nightLightState = enabled
  if (enabled) {
    touchFile(NIGHT_LIGHT_STATE_FILE)
  } else {
    removeFile(NIGHT_LIGHT_STATE_FILE)
  }
  spawnAsync(`${getHomeDir()}/.config/hypr/scripts/set-brightness.sh ${currentBrightnessValue}`)
}

export function setupAutoNightLight(): void {
  // ... existing auto logic with GLib.timeout_add
}

export function setBrightness(value: number): void {
  currentBrightnessValue = value
  spawnAsync(`${getHomeDir()}/.config/hypr/scripts/set-brightness.sh ${value}`)
}

// Start auto night light on module load
setupAutoNightLight()
```

**Exports:** State variables, calculation functions, control functions
**Imports:** GLib, constants, system-commands

---

#### `widgets/popups/network/WifiPopup.tsx` (~400 lines)
**Responsibility:** WiFi network management popup

Extracts lines 665-1075 from current `app.tsx`.

**Exports:** `WifiPopup` component
**Imports:** network-utils, popup-manager, ui-components

---

#### `widgets/popups/network/network-utils.ts` (~120 lines)
**Responsibility:** nmcli wrapper functions and WiFi network parsing

Extracts network-related utilities from lines 580-664.

```typescript
import GLib from "gi://GLib"
import { spawnSync } from "../../../lib/system-commands"

export interface WifiNetwork {
  ssid: string
  signal: number
  security: string
  active: boolean
  saved: boolean
}

export function getSavedWifiConnections(): Set<string> {
  const [ok, stdout] = spawnSync("nmcli -t -f NAME,TYPE connection show")
  if (!ok) return new Set()
  // ... existing parsing logic
}

export function parseWifiNetworks(): WifiNetwork[] {
  // ... existing parsing logic
}

export function getCurrentWifiConnection(): string {
  // ... existing logic
}

export function isWifiEnabled(): boolean {
  // ... existing logic
}

export function connectToNetwork(ssid: string, password?: string): void {
  // ... connection logic
}

export function disconnectWifi(device: string): void {
  // ... disconnect logic
}

export function forgetNetwork(ssid: string): void {
  // ... forget logic
}
```

**Exports:** Network types, parsing functions, control functions
**Imports:** GLib, system-commands

---

#### `widgets/popups/bluetooth/BluetoothPopup.tsx` (~170 lines)
**Responsibility:** Bluetooth device management popup

Extracts lines 1180-1347 from current `app.tsx`.

**Exports:** `BluetoothPopup` component
**Imports:** bluetooth-utils, popup-manager, ui-components

---

#### `widgets/popups/bluetooth/bluetooth-utils.ts` (~80 lines)
**Responsibility:** bluetoothctl wrapper functions

Extracts Bluetooth utilities from lines 1122-1179.

```typescript
import GLib from "gi://GLib"
import { spawnSync, spawnAsync } from "../../../lib/system-commands"
import { getBluetoothDeviceIcon } from "../../../lib/constants"

export interface BluetoothDevice {
  mac: string
  name: string
  connected: boolean
}

export function parseBluetoothDevices(): BluetoothDevice[] {
  // ... existing parsing logic
}

export function isBluetoothPowered(): boolean {
  // ... existing logic
}

export function connectDevice(mac: string): void {
  spawnAsync(`bluetoothctl connect ${mac}`)
}

export function disconnectDevice(mac: string): void {
  spawnAsync(`bluetoothctl disconnect ${mac}`)
}

export function toggleBluetoothPower(enabled: boolean): void {
  spawnAsync(`bluetoothctl power ${enabled ? "on" : "off"}`)
}
```

**Exports:** Device types, parsing functions, control functions
**Imports:** GLib, system-commands, constants

---

### 6. Styles

#### `styles/index.scss` (~15 lines)
**Responsibility:** Main stylesheet entry point

```scss
// Import order matters - variables first, then mixins, then components
@import 'variables';
@import 'mixins';
@import 'bar';
@import 'system-tray';
@import 'launcher';
@import 'popups/shared';
@import 'popups/audio';
@import 'popups/brightness';
@import 'popups/network';
@import 'popups/bluetooth';
```

**Note:** Split existing `style.scss` into modular files by feature.

---

## Dependency Graph

```
Layer 1 (Foundation - No dependencies):
  ├── lib/constants.ts
  └── lib/system-commands.ts

Layer 2 (Core utilities):
  ├── lib/popup-manager.ts         → constants, app
  └── lib/ui-components.ts          → popup-manager, GTK

Layer 3 (Domain logic):
  ├── widgets/popups/brightness/night-light.ts  → constants, system-commands
  ├── widgets/popups/network/network-utils.ts   → system-commands
  └── widgets/popups/bluetooth/bluetooth-utils.ts → system-commands, constants

Layer 4 (UI components):
  ├── widgets/bar/Workspaces.tsx    → constants
  ├── widgets/bar/Clients.tsx       → (no shared deps)
  ├── widgets/bar/Clock.tsx         → (no shared deps)
  ├── widgets/system-tray/Audio.tsx → popup-manager, constants
  ├── widgets/system-tray/Brightness.tsx → popup-manager
  ├── widgets/system-tray/Network.tsx → popup-manager, constants, network-utils
  ├── widgets/system-tray/Bluetooth.tsx → popup-manager, bluetooth-utils
  ├── widgets/system-tray/Caffeine.tsx → system-commands
  ├── widgets/popups/backdrop.tsx   → popup-manager
  ├── widgets/popups/audio/AudioPopup.tsx → popup-manager, ui-components
  ├── widgets/popups/brightness/BrightnessPopup.tsx → night-light, popup-manager, ui-components
  ├── widgets/popups/network/WifiPopup.tsx → network-utils, popup-manager, ui-components
  └── widgets/popups/bluetooth/BluetoothPopup.tsx → bluetooth-utils, popup-manager, ui-components

Layer 5 (Composites):
  ├── widgets/bar/index.tsx         → all bar widgets
  └── widgets/system-tray/index.tsx → all tray widgets

Layer 6 (Application):
  └── app.tsx                       → all Layer 5 components, launcher
```

**Parallelization Opportunities:**
- Layer 1 files are independent
- Layer 3 files can be built in parallel (different domains)
- Layer 4 widgets within same category can be built in parallel
- Styles can be split in parallel with code

---

## Order of Operations

### Phase 1: Foundation (Build bottom-up)
**Goal:** Extract pure utilities with zero UI dependencies

1. **Create directory structure**
   ```bash
   mkdir -p lib
   mkdir -p widgets/{bar,system-tray,popups/{audio,brightness,network,bluetooth}}
   mkdir -p styles/popups
   ```

2. **Extract constants** → `lib/constants.ts`
   - Copy all constant definitions
   - Copy icon mapping functions
   - No dependencies, safe to create first

3. **Extract system commands** → `lib/system-commands.ts`
   - Wrap GLib spawn functions
   - File operations
   - Time formatting

4. **Create popup manager** → `lib/popup-manager.ts`
   - Extract `closeAllPopups()`, `togglePopup()`
   - Uses constants and app singleton

5. **Create UI components** → `lib/ui-components.ts`
   - Extract toggle button factory
   - Extract escape handler
   - Extract slider factory

**Validation:** Run TypeScript compiler on `lib/` directory. No errors.

---

### Phase 2: Domain Logic (Extract pure business logic)
**Goal:** Separate data/state management from UI

6. **Extract night light logic** → `widgets/popups/brightness/night-light.ts`
   - Move sun calculation functions
   - Move state variables
   - Move `applyNightLight()`, `setupAutoNightLight()`

7. **Extract network utilities** → `widgets/popups/network/network-utils.ts`
   - Move WiFi interface and parsing
   - Move nmcli wrapper functions

8. **Extract Bluetooth utilities** → `widgets/popups/bluetooth/bluetooth-utils.ts`
   - Move Bluetooth interface and parsing
   - Move bluetoothctl wrapper functions

**Validation:** Run TypeScript compiler. All utilities compile independently.

---

### Phase 3: Bar Widgets (Independent UI components)
**Goal:** Split bar into reusable pieces

9. **Extract Workspaces** → `widgets/bar/Workspaces.tsx`
   - Copy lines 29-57 from `app.tsx`
   - Update imports to use `lib/constants`

10. **Extract Clients** → `widgets/bar/Clients.tsx`
    - Copy lines 82-118 from `app.tsx`
    - Include `getIconForClass()` helper (lines 59-80)

11. **Extract Clock** → `widgets/bar/Clock.tsx`
    - Copy lines 120-137 from `app.tsx`

12. **Create Bar orchestrator** → `widgets/bar/index.tsx`
    - Import all bar widgets
    - Compose layout

**Validation:** Import Bar in `app.tsx` temporarily, test bar displays correctly.

---

### Phase 4: System Tray Widgets
**Goal:** Split system tray into individual feature buttons

13. **Extract Audio button** → `widgets/system-tray/Audio.tsx`
    - Copy lines 308-339 from `app.tsx`
    - Use `togglePopup()` from popup-manager

14. **Extract Brightness button** → `widgets/system-tray/Brightness.tsx`
    - Copy lines 1110-1120 from `app.tsx`

15. **Extract Network button** → `widgets/system-tray/Network.tsx`
    - Copy lines 1388-1444 from `app.tsx`
    - Use network-utils for status polling

16. **Extract Bluetooth button** → `widgets/system-tray/Bluetooth.tsx`
    - Copy lines 1349-1386 from `app.tsx`
    - Use bluetooth-utils for status polling

17. **Extract Caffeine button** → `widgets/system-tray/Caffeine.tsx`
    - Copy lines 1077-1108 from `app.tsx`
    - Convert to use system-commands

18. **Create SystemTray composite** → `widgets/system-tray/index.tsx`
    - Import all tray widgets
    - Compose layout

**Validation:** Import SystemTray in `app.tsx`, test all buttons work.

---

### Phase 5: Popup Widgets
**Goal:** Modularize popup components

19. **Extract PopupBackdrop** → `widgets/popups/backdrop.tsx`
    - Copy lines 169-197 from `app.tsx`

20. **Extract AudioPopup** → `widgets/popups/audio/AudioPopup.tsx`
    - Copy lines 199-306 from `app.tsx`
    - Use `addEscapeHandler()` from ui-components

21. **Extract BrightnessPopup** → `widgets/popups/brightness/BrightnessPopup.tsx`
    - Copy lines 454-578 from `app.tsx`
    - Import night-light module for state/logic

22. **Extract WifiPopup** → `widgets/popups/network/WifiPopup.tsx`
    - Copy lines 665-1075 from `app.tsx`
    - Use network-utils for all nmcli operations

23. **Extract BluetoothPopup** → `widgets/popups/bluetooth/BluetoothPopup.tsx`
    - Copy lines 1180-1347 from `app.tsx`
    - Use bluetooth-utils for all bluetoothctl operations

**Validation:** Import all popups in `app.tsx`, test each popup opens/closes correctly.

---

### Phase 6: Styles Refactor
**Goal:** Split monolithic SCSS into feature modules

24. **Extract variables** → `styles/_variables.scss`
    - Copy lines 5-19 from `style.scss` (color palette)

25. **Extract mixins** → `styles/_mixins.scss`
    - Copy lines 24-50 from `style.scss` (popup-base, smooth-button)

26. **Split component styles** → `styles/{bar,system-tray,launcher}.scss`
    - Move Bar styles (lines 52-178)
    - Move system tray styles (lines 145-172)
    - Move launcher styles (lines 719-798)

27. **Split popup styles** → `styles/popups/{shared,audio,brightness,network,bluetooth}.scss`
    - Shared popup patterns
    - Individual popup styles

28. **Create main import** → `styles/index.scss`
    - Import all modules in correct order

**Validation:** Compare compiled CSS output before/after. Should be identical.

---

### Phase 7: Final Integration
**Goal:** Simplify app.tsx to pure orchestration

29. **Rewrite app.tsx**
    - Replace entire file with new minimal version (~50 lines)
    - Import all top-level components
    - Keep request handler unchanged

30. **Delete old files**
    - Remove `widget/Bar.tsx` (unused)

**Validation:** Full functional test - restart AGS, verify:
- All monitors show bars
- Workspaces filter correctly per monitor
- All popups open/close
- All tray buttons work
- Launcher still toggles via `ags toggle launcher`
- Night light auto mode works
- WiFi password dialog works
- Bluetooth device connect/disconnect works

---

### Phase 8: Cleanup & Documentation
**Goal:** Polish and document new structure

31. **Update CLAUDE.md**
    - Document new file structure
    - Add import examples
    - Note modular organization

32. **Add JSDoc comments**
    - Document all exported functions in `lib/`
    - Document component props

33. **TypeScript strict mode**
    - Ensure all files pass strict type checking
    - Add missing type annotations

---

## Risk Assessment

### Critical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Popup state breaks** | High - popups won't open/close | Thorough testing of popup-manager, keep backup of `app.tsx` |
| **Night light stops working** | Medium - auto mode breaks | Test sunrise/sunset calculation separately, verify timer runs |
| **Import cycles** | High - TypeScript won't compile | Follow dependency graph strictly, validate after each phase |
| **Missing GTK controller references** | High - UI breaks | Careful extraction of event controllers, test each widget |
| **CSS specificity changes** | Low - visual glitches | Compare compiled CSS, use same class names |

### Non-Critical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Performance regression** | Low - more imports | AGS loads all modules anyway, minimal overhead |
| **Lost comments/context** | Low - maintainability | Copy comments with code blocks |
| **Type inference breaks** | Low - compiler errors | Add explicit types where needed |

---

## Testing Strategy

### After Each Phase

1. **Compilation check:**
   ```bash
   npx tsc --noEmit
   ```

2. **Runtime test:**
   ```bash
   pkill -9 gjs && ags run
   ```

### Full Integration Test (Phase 7)

**Bar functionality:**
- [ ] Workspaces show correct IDs per monitor
- [ ] Active workspace highlighted
- [ ] Occupied workspaces marked
- [ ] Client icons appear for active workspace
- [ ] Clicking workspace switches focus
- [ ] Clicking client focuses window
- [ ] Clock shows correct time/date

**System tray:**
- [ ] All 5 buttons visible
- [ ] Audio icon reflects mute state
- [ ] Network icon shows signal strength
- [ ] Bluetooth icon shows connected state
- [ ] Caffeine toggles on/off
- [ ] Tooltips display correct info

**Popups:**
- [ ] Audio popup opens on audio button click
- [ ] Volume slider updates speaker volume
- [ ] Mute button works
- [ ] Brightness popup opens on brightness button click
- [ ] Brightness slider changes screen brightness
- [ ] Night light toggle works
- [ ] Night light auto mode activates at sunset
- [ ] WiFi popup shows networks
- [ ] WiFi password dialog works
- [ ] WiFi connect/disconnect works
- [ ] WiFi forget network works (right-click)
- [ ] Bluetooth popup shows paired devices
- [ ] Bluetooth connect/disconnect works
- [ ] All popups close on escape key
- [ ] Clicking backdrop closes all popups
- [ ] Only one popup open at a time

**Launcher:**
- [ ] `ags toggle launcher` opens/closes launcher
- [ ] Search filters apps
- [ ] Enter launches selected app
- [ ] Arrow keys navigate results

**Night light edge cases:**
- [ ] Sunrise/sunset times calculated for Austin, TX
- [ ] Auto mode checks every minute
- [ ] Manual toggle disables auto mode
- [ ] Re-enabling auto applies current time state

---

## Rollback Plan

If critical bugs discovered after Phase 7:

1. **Restore original file:**
   ```bash
   git checkout app.tsx
   ```

2. **Keep new modules for gradual migration:**
   - `lib/` utilities can be used by original `app.tsx`
   - Import individual functions as needed

3. **Identify specific broken feature:**
   - Test each popup individually
   - Bisect between phases to find regression

---

## Success Criteria

✅ **Functional parity:**
- All features work identically to original `app.tsx`
- No visual changes
- No performance degradation

✅ **Code quality:**
- No file >200 lines (except WifiPopup ~400 due to complexity)
- Clear single responsibility per file
- Zero circular dependencies
- All TypeScript strict checks pass

✅ **Maintainability:**
- Can modify one popup without touching others
- Can add new system tray button in <30 lines
- Can add new popup in <200 lines
- Clear import paths, no relative hell (`../../../`)

✅ **Documentation:**
- Each module has clear exports/imports documented
- CLAUDE.md updated with new structure
- Example code for adding features

---

## Post-Refactor Benefits

### For Development

1. **Parallel work:** Multiple features can be developed simultaneously
2. **Easier testing:** Test individual popups in isolation
3. **Faster iteration:** Changes to one popup don't require full rebuild
4. **Clear ownership:** Each file has single responsibility

### For Maintenance

1. **Bug isolation:** Issues confined to specific modules
2. **Easier debugging:** Smaller files, clearer stack traces
3. **Safe refactoring:** Can change internals without breaking imports
4. **Code reuse:** Utilities shared across widgets

### For Extension

1. **Add new popup:** Create new directory in `widgets/popups/`
2. **Add new tray button:** Create file in `widgets/system-tray/`
3. **Add new bar widget:** Create file in `widgets/bar/`
4. **Add new utility:** Create function in `lib/`

---

## Example: Adding New Feature (Power Menu)

After refactor, adding a power menu popup:

1. **Create popup component:**
   ```typescript
   // widgets/popups/power/PowerMenu.tsx
   import { togglePopup } from "../../../lib/popup-manager"
   import { addEscapeHandler } from "../../../lib/ui-components"
   // ... implement popup
   ```

2. **Create tray button:**
   ```typescript
   // widgets/system-tray/Power.tsx
   import { togglePopup } from "../../lib/popup-manager"
   export default function Power() {
     return <button onClicked={() => togglePopup("power-menu")}>⏻</button>
   }
   ```

3. **Add to system tray:**
   ```typescript
   // widgets/system-tray/index.tsx
   import Power from "./Power"
   // Add <Power /> to layout
   ```

4. **Register in app:**
   ```typescript
   // app.tsx
   import PowerMenu from "./widgets/popups/power/PowerMenu"
   // Add <PowerMenu /> to main() return array
   ```

**Total changes:** 4 files, ~100 lines. Original would require editing 1500-line monolith.

---

## Questions for User (Before Implementation)

1. **Location:** Current sunrise/sunset uses Austin, TX coordinates. Change to your location?

2. **Brightness script:** Assumes `~/.config/hypr/scripts/set-brightness.sh` exists. Verify path?

3. **Settings apps:** Uses `pavucontrol` (audio) and `plasma-open-settings` (network/bluetooth). Correct?

4. **Workspace mapping:** Keep current DP-3/DP-1/HDMI-A-1 mapping or make dynamic?

5. **Unused file:** Confirm `widget/Bar.tsx` is safe to delete?

---

## Timeline Estimate

| Phase | Estimated Time | Can Parallelize? |
|-------|---------------|------------------|
| Phase 1: Foundation | 1 hour | No (sequential) |
| Phase 2: Domain Logic | 1 hour | Yes (3 files) |
| Phase 3: Bar Widgets | 1 hour | Yes (4 files) |
| Phase 4: System Tray | 1.5 hours | Yes (5 files) |
| Phase 5: Popups | 2 hours | Yes (5 files) |
| Phase 6: Styles | 1 hour | Yes (parallel with code) |
| Phase 7: Integration | 30 min | No |
| Phase 8: Cleanup | 30 min | No |
| **Total** | **8.5 hours** | **~5 hours with parallelization** |

With multiple agents working in parallel (Layer 3 + Layer 4), total time could be ~5-6 hours.

---

## Conclusion

This refactoring plan transforms a 1513-line monolith into a maintainable, feature-organized codebase with:

- **30 focused modules** (avg ~60 lines each)
- **Clear dependency hierarchy** (6 layers, bottom-up)
- **Zero functional changes** (validation at each phase)
- **Parallel development enabled** (independent feature modules)

**Risk:** Low (incremental phases with validation)
**Benefit:** High (long-term maintainability, extensibility)
**Reversibility:** High (git checkout if issues found)

Ready to implement when approved.
