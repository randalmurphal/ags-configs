import app from "ags/gtk4/app"
import style from "./style.scss"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import GLib from "gi://GLib"
import GioUnix from "gi://GioUnix"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"
import AstalHyprland from "gi://AstalHyprland"
import AstalWp from "gi://AstalWp"
import { createBinding, For } from "ags"
import { Launcher, toggleLauncher } from "./launcher"

// Export toggleLauncher for external use
;(globalThis as any).toggleLauncher = toggleLauncher

// Workspace to monitor mapping (from hyprland.conf)
const WORKSPACE_MONITOR_MAP: Record<string, number[]> = {
  "DP-3": [1, 2, 3, 10],      // Center (primary)
  "DP-1": [4, 5, 6],          // Left
  "HDMI-A-1": [7, 8, 9],      // Right
}

function getMonitorWorkspaces(monitorName: string): number[] {
  return WORKSPACE_MONITOR_MAP[monitorName] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
}

function Workspaces({ monitorName }: { monitorName: string }) {
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

function getIconForClass(appClass: string): Gio.Icon | null {
  if (!appClass) return null

  // Try different desktop file ID formats
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

  // Fallback: try the class name directly as icon name
  return Gio.ThemedIcon.new(appClass.toLowerCase())
}

function Clients({ monitorName }: { monitorName: string }) {
  const hypr = AstalHyprland.get_default()
  const clients = createBinding(hypr, "clients")
  const focused = createBinding(hypr, "focusedClient")

  const monitorClients = clients((cls: any[]) => {
    const hyprMonitor = hypr.get_monitors().find((m: any) => m.name === monitorName)
    if (!hyprMonitor) return []
    const activeWsId = hyprMonitor.activeWorkspace?.id
    if (!activeWsId) return []
    return cls
      .filter((c) => c.workspace?.id === activeWsId)
      .slice(0, 8)
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
            <image
              cssClasses={["client-icon"]}
              gicon={getIconForClass(client.class)}
              pixelSize={18}
            />
          </button>
        )}
      </For>
    </box>
  )
}

function Clock() {
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

// Popup management - simple toggle, close others when opening
const POPUP_NAMES = ["audio-popup", "brightness-popup", "wifi-popup", "bluetooth-popup"]

function closeAllPopups() {
  POPUP_NAMES.forEach(pn => {
    const p = app.get_window(pn)
    if (p && p.visible) p.visible = false
  })
  // Hide backdrop
  const backdrop = app.get_window("popup-backdrop")
  if (backdrop) backdrop.visible = false
}

function togglePopup(name: string) {
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

// Transparent backdrop that covers screen to catch outside clicks
function PopupBackdrop() {
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

  // Click anywhere on backdrop closes all popups
  const clickController = new Gtk.GestureClick()
  clickController.connect("released", () => {
    closeAllPopups()
  })
  win.add_controller(clickController)

  return win
}

// Audio popup - uses direct visibility toggle
function AudioPopup() {
  const { TOP, RIGHT } = Astal.WindowAnchor
  const wp = AstalWp.get_default()
  const speaker = wp?.audio?.defaultSpeaker

  if (!speaker) {
    return null
  }

  const volume = createBinding(speaker, "volume")
  const muted = createBinding(speaker, "mute")

  // Create popup window - OVERLAY layer to be above backdrop
  const win = (
    <window
      visible={false}
      namespace="ags-audio-popup"
      name="audio-popup"
      cssClasses={["AudioPopup"]}
      anchor={TOP | RIGHT}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <box cssClasses={["audio-popup-content"]} orientation={Gtk.Orientation.VERTICAL}>
        <box cssClasses={["audio-header"]}>
          <label label="󰕾 Audio" cssClasses={["popup-title"]} />
        </box>

        <box cssClasses={["volume-section"]} orientation={Gtk.Orientation.VERTICAL}>
          <box cssClasses={["volume-row"]}>
            <label label="Volume" />
            <label
              label={volume((v: number) => `${Math.round(v * 100)}%`)}
              cssClasses={["volume-value"]}
            />
          </box>
          {(() => {
            const scale = new Gtk.Scale({
              orientation: Gtk.Orientation.HORIZONTAL,
              drawValue: false,
              hexpand: true,
            })
            scale.set_range(0, 100)
            scale.set_increments(1, 5)
            scale.add_css_class("volume-slider")

            // Track if we're updating from external source to avoid loops
            let updatingFromBinding = false

            // Subscribe to volume changes - this also sets initial value
            speaker.connect("notify::volume", () => {
              updatingFromBinding = true
              scale.set_value(speaker.volume * 100)
              updatingFromBinding = false
            })

            // Set initial value
            scale.set_value(speaker.volume * 100)

            // Handle user input
            scale.connect("value-changed", () => {
              if (!updatingFromBinding) {
                speaker.volume = scale.get_value() / 100
              }
            })
            return scale
          })()}
        </box>

        <box cssClasses={["controls-section"]}>
          <button
            cssClasses={muted((m: boolean) => m ? ["mute-btn", "active"] : ["mute-btn"])}
            onClicked={() => { speaker.mute = !speaker.mute }}
          >
            <label label={muted((m: boolean) => m ? "󰖁 Unmute" : "󰕾 Mute")} />
          </button>

          <button
            cssClasses={["settings-btn"]}
            onClicked={() => {
              GLib.spawn_command_line_async("pavucontrol")
              const popup = app.get_window("audio-popup")
              if (popup) popup.visible = false
            }}
          >
            <label label=" Settings" />
          </button>
        </box>
      </box>
    </window>
  ) as Astal.Window

  // Escape key to close
  const keyController = new Gtk.EventControllerKey()
  keyController.connect("key-pressed", (_ctrl: any, keyval: number) => {
    if (keyval === Gdk.KEY_Escape) {
      closeAllPopups()
      return true
    }
    return false
  })
  win.add_controller(keyController)

  return win
}

function Audio() {
  const wp = AstalWp.get_default()
  const speaker = wp?.audio?.defaultSpeaker

  if (!speaker) {
    return <button cssClasses={["systray-btn"]}><label cssClasses={["icon"]} label="󰖁" /></button>
  }

  const volume = createBinding(speaker, "volume")
  const muted = createBinding(speaker, "mute")

  const getVolumeIcon = (vol: number, isMuted: boolean) => {
    if (isMuted) return "󰖁"
    if (vol > 0.66) return "󰕾"
    if (vol > 0.33) return "󰖀"
    if (vol > 0) return "󰕿"
    return "󰖁"
  }

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

// Brightness popup state (software brightness via shader, 100 = no dimming)
let currentBrightnessValue = 100
let nightLightState = GLib.file_test("/tmp/ags-nightlight-active", GLib.FileTest.EXISTS)
let nightLightAuto = true // Auto mode based on time

// Location for sunrise/sunset calculation (Austin, TX area)
// To change: update these coordinates for your location
const LATITUDE = 30.27  // degrees North
const LONGITUDE = -97.74  // degrees West (negative)

// Calculate sunrise/sunset times using astronomical formula
// Returns { sunrise: hour (decimal), sunset: hour (decimal) }
function calculateSunTimes(): { sunrise: number; sunset: number } {
  const now = GLib.DateTime.new_now_local()
  if (!now) return { sunrise: 6, sunset: 18 }

  const dayOfYear = now.get_day_of_year()
  const lat = LATITUDE * Math.PI / 180  // Convert to radians

  // Solar declination angle (simplified formula)
  const declination = -23.45 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365) * Math.PI / 180

  // Hour angle at sunrise/sunset (when sun is at horizon, -0.83 degrees for refraction)
  const zenith = 90.833 * Math.PI / 180
  const cosHourAngle = (Math.cos(zenith) - Math.sin(lat) * Math.sin(declination)) /
                       (Math.cos(lat) * Math.cos(declination))

  // Clamp for polar regions
  const clampedCos = Math.max(-1, Math.min(1, cosHourAngle))
  const hourAngle = Math.acos(clampedCos) * 180 / Math.PI

  // Solar noon (approximate - ignoring equation of time for simplicity)
  const solarNoon = 12 - LONGITUDE / 15

  // Get timezone offset in hours
  const utcOffset = now.get_utc_offset() / 3600000000  // microseconds to hours

  // Calculate sunrise and sunset in local time
  const sunrise = solarNoon - hourAngle / 15 + utcOffset
  const sunset = solarNoon + hourAngle / 15 + utcOffset

  return { sunrise, sunset }
}

// Cached sun times (recalculated once per day)
let cachedSunTimes = calculateSunTimes()
let lastSunCalcDay = GLib.DateTime.new_now_local()?.get_day_of_year() || 0

function getSunTimes(): { sunrise: number; sunset: number } {
  const now = GLib.DateTime.new_now_local()
  const today = now?.get_day_of_year() || 0
  if (today !== lastSunCalcDay) {
    cachedSunTimes = calculateSunTimes()
    lastSunCalcDay = today
  }
  return cachedSunTimes
}

// Check if current time is "night" (between sunset and sunrise)
function isNightTime(): boolean {
  const now = GLib.DateTime.new_now_local()
  if (!now) return false
  const hour = now.get_hour() + now.get_minute() / 60
  const { sunrise, sunset } = getSunTimes()
  return hour >= sunset || hour < sunrise
}

// Format time for display (e.g., "6:45 AM")
function formatSunTime(decimalHour: number): string {
  const hour = Math.floor(decimalHour)
  const minutes = Math.round((decimalHour - hour) * 60)
  const ampm = hour >= 12 ? "PM" : "AM"
  const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${ampm}`
}

// Apply night light based on current state
function applyNightLight(enabled: boolean) {
  nightLightState = enabled
  if (enabled) {
    GLib.spawn_command_line_async("touch /tmp/ags-nightlight-active")
  } else {
    GLib.spawn_command_line_async("rm -f /tmp/ags-nightlight-active")
  }
  GLib.spawn_command_line_async(`${GLib.get_home_dir()}/.config/hypr/scripts/set-brightness.sh ${currentBrightnessValue}`)
}

// Auto night light check - runs every minute
function setupAutoNightLight() {
  // Initial check
  if (nightLightAuto) {
    const shouldBeOn = isNightTime()
    if (shouldBeOn !== nightLightState) {
      applyNightLight(shouldBeOn)
    }
  }

  // Check every minute
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60000, () => {
    if (nightLightAuto) {
      const shouldBeOn = isNightTime()
      if (shouldBeOn !== nightLightState) {
        applyNightLight(shouldBeOn)
        print(`Auto night light: ${shouldBeOn ? "enabled" : "disabled"}`)
      }
    }
    return GLib.SOURCE_CONTINUE
  })
}

// Start auto night light on load
setupAutoNightLight()

function BrightnessPopup() {
  const { TOP, RIGHT } = Astal.WindowAnchor

  const win = (
    <window
      visible={false}
      namespace="ags-brightness-popup"
      name="brightness-popup"
      cssClasses={["BrightnessPopup"]}
      anchor={TOP | RIGHT}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <box cssClasses={["brightness-popup-content"]} orientation={Gtk.Orientation.VERTICAL}>
        <box cssClasses={["brightness-header"]}>
          <label label="󰃟 Brightness" cssClasses={["popup-title"]} />
        </box>

        <box cssClasses={["brightness-section"]} orientation={Gtk.Orientation.VERTICAL}>
          <box cssClasses={["brightness-row"]}>
            <label label="All Monitors" />
            <label name="brightness-value-label" label={`${currentBrightnessValue}%`} cssClasses={["brightness-value"]} />
          </box>
          {(() => {
            const scale = new Gtk.Scale({
              orientation: Gtk.Orientation.HORIZONTAL,
              drawValue: false,
              hexpand: true,
            })
            scale.set_range(5, 100)
            scale.set_increments(5, 10)
            scale.add_css_class("brightness-slider")
            scale.set_value(currentBrightnessValue)

            // Instant shader-based brightness - no debounce needed!
            scale.connect("value-changed", () => {
              const value = Math.round(scale.get_value())
              currentBrightnessValue = value
              // Shader-based brightness is instant
              GLib.spawn_command_line_async(`${GLib.get_home_dir()}/.config/hypr/scripts/set-brightness.sh ${value}`)
            })
            return scale
          })()}
        </box>

        <box cssClasses={["nightlight-section"]}>
          <box cssClasses={["nightlight-info"]} hexpand orientation={Gtk.Orientation.VERTICAL}>
            <box>
              <label cssClasses={["nightlight-icon"]} label="󰖔 " />
              <label label="Night Light" cssClasses={["nightlight-label"]} />
            </box>
            {(() => {
              const { sunrise, sunset } = getSunTimes()
              const desc = nightLightAuto
                ? `Auto: ${formatSunTime(sunset)} - ${formatSunTime(sunrise)}`
                : "Manual mode"
              return <label label={desc} cssClasses={["nightlight-description"]} />
            })()}
          </box>
          {(() => {
            const btn = new Gtk.Button()
            btn.add_css_class("toggle-btn")
            if (nightLightState) btn.add_css_class("active")
            const lbl = new Gtk.Label({ label: nightLightState ? "ON" : "OFF" })
            btn.set_child(lbl)
            btn.connect("clicked", () => {
              // Manual toggle disables auto mode
              nightLightAuto = false
              nightLightState = !nightLightState
              if (nightLightState) {
                btn.add_css_class("active")
                lbl.label = "ON"
              } else {
                btn.remove_css_class("active")
                lbl.label = "OFF"
              }
              applyNightLight(nightLightState)
            })
            return btn
          })()}
        </box>

        <box cssClasses={["auto-section"]}>
          <label label="Auto (sunrise/sunset)" hexpand />
          {(() => {
            const btn = new Gtk.Button()
            btn.add_css_class("toggle-btn")
            if (nightLightAuto) btn.add_css_class("active")
            const lbl = new Gtk.Label({ label: nightLightAuto ? "ON" : "OFF" })
            btn.set_child(lbl)
            btn.connect("clicked", () => {
              nightLightAuto = !nightLightAuto
              if (nightLightAuto) {
                btn.add_css_class("active")
                lbl.label = "ON"
                // Immediately apply based on time
                const shouldBeOn = isNightTime()
                applyNightLight(shouldBeOn)
              } else {
                btn.remove_css_class("active")
                lbl.label = "OFF"
              }
            })
            return btn
          })()}
        </box>
      </box>
    </window>
  ) as Astal.Window

  // Escape key to close
  const keyController = new Gtk.EventControllerKey()
  keyController.connect("key-pressed", (_ctrl: any, keyval: number) => {
    if (keyval === Gdk.KEY_Escape) {
      closeAllPopups()
      return true
    }
    return false
  })
  win.add_controller(keyController)

  return win
}

// WiFi network interface
interface WifiNetwork {
  ssid: string
  signal: number
  security: string
  active: boolean
  saved: boolean  // Whether this network has a saved connection profile
}

// Get list of saved WiFi connection names
function getSavedWifiConnections(): Set<string> {
  const [ok, stdout] = GLib.spawn_command_line_sync("nmcli -t -f NAME,TYPE connection show")
  if (!ok) return new Set()
  const output = new TextDecoder().decode(stdout)
  const saved = new Set<string>()
  for (const line of output.trim().split("\n")) {
    const parts = line.split(":")
    if (parts[1] === "802-11-wireless" && parts[0]) {
      saved.add(parts[0])
    }
  }
  return saved
}

// Parse nmcli wifi list output
function parseWifiNetworks(): WifiNetwork[] {
  const [ok, stdout] = GLib.spawn_command_line_sync("nmcli -t -f SSID,SIGNAL,SECURITY,ACTIVE device wifi list")
  if (!ok) return []

  const savedConnections = getSavedWifiConnections()
  const output = new TextDecoder().decode(stdout)
  const lines = output.trim().split("\n").filter(l => l.length > 0)
  const seen = new Set<string>()

  return lines.map(line => {
    const parts = line.split(":")
    if (parts.length < 4) return null
    const ssid = parts[0]
    if (!ssid || seen.has(ssid)) return null
    seen.add(ssid)

    return {
      ssid,
      signal: parseInt(parts[1]) || 0,
      security: parts[2] || "",
      active: parts[3] === "yes",
      saved: savedConnections.has(ssid),
    }
  }).filter((n): n is WifiNetwork => n !== null)
    .sort((a, b) => b.signal - a.signal)
    .slice(0, 8)
}

// Get current WiFi connection
function getCurrentWifiConnection(): string {
  const [ok, stdout] = GLib.spawn_command_line_sync("nmcli -t -f NAME,TYPE,DEVICE connection show --active")
  if (!ok) return ""
  const output = new TextDecoder().decode(stdout)
  const lines = output.trim().split("\n")
  for (const line of lines) {
    const parts = line.split(":")
    if (parts[1] === "802-11-wireless" && parts[2]) {
      return parts[0]
    }
  }
  return ""
}

// Check if WiFi is enabled
function isWifiEnabled(): boolean {
  const [ok, stdout] = GLib.spawn_command_line_sync("nmcli radio wifi")
  if (!ok) return false
  return new TextDecoder().decode(stdout).trim() === "enabled"
}

// Get signal strength icon
function getWifiSignalIcon(strength: number): string {
  if (strength >= 80) return "󰤨"
  if (strength >= 60) return "󰤥"
  if (strength >= 40) return "󰤢"
  if (strength >= 20) return "󰤟"
  return "󰤯"
}

// WiFi popup using nmcli with dynamic polling and password dialog
function WifiPopup() {
  const { TOP, RIGHT } = Astal.WindowAnchor

  // Polling state
  let pollSourceId: number | null = null
  let isScanning = false
  let selectedNetwork: string | null = null

  // Containers for dynamic content
  const connectionLabel = new Gtk.Label({ xalign: 0 })
  connectionLabel.add_css_class("connection-status")

  // Scanning indicator
  const scanningBox = new Gtk.Box({ spacing: 8, halign: Gtk.Align.CENTER })
  scanningBox.add_css_class("scanning-indicator")
  const scanningSpinner = new Gtk.Spinner()
  const scanningLabel = new Gtk.Label({ label: "Scanning..." })
  scanningLabel.add_css_class("scanning-text")
  scanningBox.append(scanningSpinner)
  scanningBox.append(scanningLabel)
  scanningBox.visible = false

  // Password entry dialog (hidden by default)
  const passwordBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
  })
  passwordBox.add_css_class("password-dialog")
  passwordBox.visible = false

  const passwordHeader = new Gtk.Box({ spacing: 8 })
  const passwordNetworkLabel = new Gtk.Label({ label: "", xalign: 0, hexpand: true })
  passwordNetworkLabel.add_css_class("password-network-name")
  const passwordBackBtn = new Gtk.Button({ label: "✕" })
  passwordBackBtn.add_css_class("password-back-btn")
  passwordHeader.append(passwordNetworkLabel)
  passwordHeader.append(passwordBackBtn)
  passwordBox.append(passwordHeader)

  const passwordEntry = new Gtk.PasswordEntry({
    showPeekIcon: true,
    placeholderText: "Enter WiFi password",
  })
  passwordEntry.add_css_class("password-entry")
  passwordBox.append(passwordEntry)

  const passwordConnectBtn = new Gtk.Button({ label: "Connect" })
  passwordConnectBtn.add_css_class("password-connect-btn")
  passwordBox.append(passwordConnectBtn)

  const passwordErrorLabel = new Gtk.Label({ label: "", xalign: 0 })
  passwordErrorLabel.add_css_class("password-error")
  passwordErrorLabel.visible = false
  passwordBox.append(passwordErrorLabel)

  // Show password dialog for a network
  function showPasswordDialog(ssid: string) {
    selectedNetwork = ssid
    passwordNetworkLabel.label = `Connect to "${ssid}"`
    passwordEntry.set_text("")
    passwordErrorLabel.visible = false
    passwordBox.visible = true
    networksListBox.visible = false
    passwordEntry.grab_focus()
  }

  // Hide password dialog
  function hidePasswordDialog() {
    selectedNetwork = null
    passwordBox.visible = false
    networksListBox.visible = true
  }

  // Connect with password
  function connectWithPassword() {
    if (!selectedNetwork) return
    const password = passwordEntry.get_text()
    if (!password || password.length < 8) {
      passwordErrorLabel.label = "Password must be at least 8 characters"
      passwordErrorLabel.visible = true
      return
    }

    passwordErrorLabel.visible = false
    passwordConnectBtn.label = "Connecting..."
    passwordConnectBtn.sensitive = false

    // Show auth hint
    passwordErrorLabel.label = "System auth may be required..."
    passwordErrorLabel.add_css_class("info")
    passwordErrorLabel.visible = true

    // Use nmcli with password - escape special chars in password
    const escapedPass = password.replace(/'/g, "'\\''")
    const cmd = `nmcli device wifi connect '${selectedNetwork}' password '${escapedPass}'`

    // Run connection attempt
    GLib.spawn_command_line_async(cmd)

    // Check result multiple times (polkit auth can take a while)
    let attempts = 0
    const maxAttempts = 5
    const checkConnection = () => {
      attempts++
      const currentConn = getCurrentWifiConnection()
      if (currentConn === selectedNetwork) {
        // Success!
        passwordErrorLabel.remove_css_class("info")
        hidePasswordDialog()
        refreshWifi()
        passwordConnectBtn.label = "Connect"
        passwordConnectBtn.sensitive = true
        return GLib.SOURCE_REMOVE
      } else if (attempts >= maxAttempts) {
        // Failed after all attempts
        passwordErrorLabel.remove_css_class("info")
        passwordErrorLabel.label = "Connection failed. Check password."
        passwordErrorLabel.visible = true
        passwordConnectBtn.label = "Connect"
        passwordConnectBtn.sensitive = true
        return GLib.SOURCE_REMOVE
      }
      // Keep checking
      return GLib.SOURCE_CONTINUE
    }

    // Check every 2 seconds for up to 10 seconds total
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, checkConnection)
  }

  passwordBackBtn.connect("clicked", hidePasswordDialog)
  passwordConnectBtn.connect("clicked", connectWithPassword)
  passwordEntry.connect("activate", connectWithPassword) // Enter key

  const networksListBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
  })
  networksListBox.add_css_class("networks-list")

  const toggleBtnContainer = new Gtk.Box()

  // Show scanning animation
  function showScanning(show: boolean) {
    isScanning = show
    scanningBox.visible = show
    if (show) {
      scanningSpinner.start()
    } else {
      scanningSpinner.stop()
    }
  }

  // Refresh function
  function refreshWifi() {
    const wifiEnabled = isWifiEnabled()
    const currentConn = getCurrentWifiConnection()
    const networks = parseWifiNetworks()

    // Update connection label
    connectionLabel.label = currentConn ? `Connected: ${currentConn}` : "Not connected"

    // Clear networks list
    let child = networksListBox.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      networksListBox.remove(child)
      child = next
    }

    // Rebuild networks list
    if (wifiEnabled && networks.length > 0) {
      networks.forEach(network => {
        const btn = new Gtk.Button()
        btn.add_css_class("network-item")
        if (network.active) btn.add_css_class("active")
        if (network.saved) btn.add_css_class("saved")

        const box = new Gtk.Box({ spacing: 8 })

        const nameLabel = new Gtk.Label({
          label: `${getWifiSignalIcon(network.signal)} ${network.ssid}`,
          xalign: 0,
          hexpand: true,
        })
        nameLabel.add_css_class("network-name")
        box.append(nameLabel)

        // Show saved indicator
        if (network.saved && !network.active) {
          const savedLabel = new Gtk.Label({ label: "󰄬" })
          savedLabel.add_css_class("network-saved")
          savedLabel.tooltipText = "Saved"
          box.append(savedLabel)
        }

        if (network.security && !network.saved) {
          const secLabel = new Gtk.Label({ label: "󰌾" })
          secLabel.add_css_class("network-security")
          box.append(secLabel)
        }

        const signalLabel = new Gtk.Label({ label: `${network.signal}%` })
        signalLabel.add_css_class("network-signal")
        box.append(signalLabel)

        btn.set_child(box)

        // Left click: connect or disconnect
        btn.connect("clicked", () => {
          if (network.active) {
            // Disconnect from current network (get wifi device dynamically)
            const [, devOut] = GLib.spawn_command_line_sync("nmcli -t -f DEVICE,TYPE device status")
            const devLines = new TextDecoder().decode(devOut).split("\n")
            const wifiDev = devLines.find(l => l.includes(":wifi"))?.split(":")[0] || "wlp5s0"
            GLib.spawn_command_line_async(`nmcli device disconnect ${wifiDev}`)
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
              refreshWifi()
              return GLib.SOURCE_REMOVE
            })
          } else if (network.saved) {
            // Try to connect - if it fails due to missing password, show dialog
            GLib.spawn_command_line_async(`nmcli connection up "${network.ssid}"`)
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
              const currentConn = getCurrentWifiConnection()
              if (currentConn !== network.ssid) {
                // Connection failed, probably needs password
                showPasswordDialog(network.ssid)
              } else {
                refreshWifi()
              }
              return GLib.SOURCE_REMOVE
            })
          } else if (network.security) {
            // New secured network - show password dialog
            showPasswordDialog(network.ssid)
          } else {
            // Open network - connect directly
            GLib.spawn_command_line_async(`nmcli device wifi connect "${network.ssid}"`)
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
              refreshWifi()
              return GLib.SOURCE_REMOVE
            })
          }
        })

        // Right click: forget saved network
        const rightClickCtrl = new Gtk.GestureClick({ button: 3 }) // Button 3 = right click
        rightClickCtrl.connect("pressed", () => {
          if (network.saved) {
            // Delete the saved connection
            GLib.spawn_command_line_async(`nmcli connection delete "${network.ssid}"`)
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
              refreshWifi()
              return GLib.SOURCE_REMOVE
            })
          }
        })
        btn.add_controller(rightClickCtrl)

        networksListBox.append(btn)
      })
      showScanning(false)
    } else if (wifiEnabled) {
      if (!isScanning) {
        const emptyLabel = new Gtk.Label({ label: "No networks found" })
        emptyLabel.add_css_class("empty-label")
        networksListBox.append(emptyLabel)
      }
    } else {
      showScanning(false)
      const offLabel = new Gtk.Label({ label: "WiFi is disabled" })
      offLabel.add_css_class("empty-label")
      networksListBox.append(offLabel)
    }

    // Update toggle button
    const oldBtn = toggleBtnContainer.get_first_child()
    if (oldBtn) toggleBtnContainer.remove(oldBtn)

    const toggleBtn = new Gtk.Button()
    toggleBtn.add_css_class("toggle-btn")
    if (wifiEnabled) toggleBtn.add_css_class("active")
    toggleBtn.label = wifiEnabled ? "ON" : "OFF"
    toggleBtn.connect("clicked", () => {
      if (wifiEnabled) {
        GLib.spawn_command_line_async("nmcli radio wifi off")
        stopPolling()
      } else {
        GLib.spawn_command_line_async("nmcli radio wifi on")
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          startPolling()
          return GLib.SOURCE_REMOVE
        })
      }
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        refreshWifi()
        return GLib.SOURCE_REMOVE
      })
    })
    toggleBtnContainer.append(toggleBtn)
  }

  // Start dynamic polling while popup is open
  function startPolling() {
    if (pollSourceId !== null) return
    if (!isWifiEnabled()) return

    // Initial scan with animation
    showScanning(true)
    GLib.spawn_command_line_async("nmcli device wifi rescan")

    // Refresh after initial scan
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
      refreshWifi()
      return GLib.SOURCE_REMOVE
    })

    // Poll every 5 seconds while popup is open
    pollSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
      if (!isWifiEnabled()) {
        stopPolling()
        return GLib.SOURCE_REMOVE
      }
      // Rescan and refresh
      GLib.spawn_command_line_async("nmcli device wifi rescan")
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        refreshWifi()
        return GLib.SOURCE_REMOVE
      })
      return GLib.SOURCE_CONTINUE
    })
  }

  // Stop polling when popup closes
  function stopPolling() {
    if (pollSourceId !== null) {
      GLib.source_remove(pollSourceId)
      pollSourceId = null
    }
    showScanning(false)
  }

  // Initial population
  refreshWifi()

  const win = (
    <window
      visible={false}
      namespace="ags-wifi-popup"
      name="wifi-popup"
      cssClasses={["WifiPopup"]}
      anchor={TOP | RIGHT}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <box cssClasses={["wifi-popup-content"]} orientation={Gtk.Orientation.VERTICAL}>
        <box cssClasses={["wifi-header"]}>
          <label label="󰤨 WiFi" cssClasses={["popup-title"]} hexpand />
          {toggleBtnContainer}
        </box>

        <box cssClasses={["current-connection"]}>
          {connectionLabel}
        </box>

        {scanningBox}
        {networksListBox}
        {passwordBox}

        <box cssClasses={["controls-section"]}>
          <button
            cssClasses={["settings-btn"]}
            hexpand
            onClicked={() => {
              GLib.spawn_command_line_async("plasma-open-settings kcm_networkmanagement")
              closeAllPopups()
            }}
          >
            <label label=" Open Settings" />
          </button>
        </box>
      </box>
    </window>
  ) as Astal.Window

  // Start/stop polling when popup visibility changes
  win.connect("notify::visible", () => {
    if (win.visible) {
      refreshWifi()
      startPolling()
    } else {
      stopPolling()
    }
  })

  // Escape key to close
  const keyController = new Gtk.EventControllerKey()
  keyController.connect("key-pressed", (_ctrl: any, keyval: number) => {
    if (keyval === Gdk.KEY_Escape) {
      closeAllPopups()
      return true
    }
    return false
  })
  win.add_controller(keyController)

  return win
}

// Caffeine state
let caffeineState = GLib.file_test("/tmp/ags-caffeine-active", GLib.FileTest.EXISTS)

function Caffeine() {
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
      GLib.spawn_command_line_async("bash -c 'systemd-inhibit --what=idle --who=ags-caffeine --why=\"Caffeine mode\" sleep infinity &'")
      GLib.spawn_command_line_async("touch /tmp/ags-caffeine-active")
    } else {
      btn.remove_css_class("active")
      icon.label = "󰛊"
      btn.tooltipText = "Caffeine OFF"
      GLib.spawn_command_line_async("pkill -f 'systemd-inhibit.*ags-caffeine'")
      GLib.spawn_command_line_async("rm -f /tmp/ags-caffeine-active")
    }
  })

  return btn
}

function Brightness() {
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

// Bluetooth device management
interface BluetoothDevice {
  mac: string
  name: string
  connected: boolean
}

function parseBluetoothDevices(): BluetoothDevice[] {
  const [ok, stdout] = GLib.spawn_command_line_sync("bluetoothctl devices Paired")
  if (!ok) return []

  const output = new TextDecoder().decode(stdout)
  const lines = output.trim().split("\n").filter(l => l.startsWith("Device "))

  return lines.map(line => {
    // Format: "Device XX:XX:XX:XX:XX:XX DeviceName"
    const parts = line.substring(7) // Remove "Device "
    const spaceIndex = parts.indexOf(" ")
    if (spaceIndex === -1) return null

    const mac = parts.substring(0, spaceIndex)
    const name = parts.substring(spaceIndex + 1)

    // Check connection status
    const [connOk, connStdout] = GLib.spawn_command_line_sync(`bluetoothctl info ${mac}`)
    const connected = connOk && new TextDecoder().decode(connStdout).includes("Connected: yes")

    return { mac, name, connected }
  }).filter((d): d is BluetoothDevice => d !== null)
}

function isBluetoothPowered(): boolean {
  const [ok, stdout] = GLib.spawn_command_line_sync("bluetoothctl show")
  if (!ok) return false
  const output = new TextDecoder().decode(stdout)
  return output.includes("Powered: yes")
}

function getDeviceIcon(deviceName: string): string {
  const name = deviceName.toLowerCase()
  if (name.includes("headphone") || name.includes("earbuds") || name.includes("buds") || name.includes("airpod")) {
    return "󰋋"
  }
  if (name.includes("keyboard")) {
    return "󰍽"
  }
  if (name.includes("mouse")) {
    return "󰦏"
  }
  if (name.includes("controller") || name.includes("gamepad")) {
    return "󰊴"
  }
  if (name.includes("speaker")) {
    return "󰓃"
  }
  return "󰂱"
}

function BluetoothPopup() {
  const { TOP, RIGHT } = Astal.WindowAnchor

  // State for bluetooth power and devices
  let bluetoothPowered = isBluetoothPowered()
  let devices = parseBluetoothDevices()

  // Container for device list - we'll update this dynamically
  const deviceListBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
  })
  deviceListBox.add_css_class("device-list")

  // Container for power toggle button (we'll update it)
  const toggleBtnContainer = new Gtk.Box()

  // Function to refresh device list
  function refreshDevices() {
    bluetoothPowered = isBluetoothPowered()
    devices = parseBluetoothDevices()

    // Clear device list
    let child = deviceListBox.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      deviceListBox.remove(child)
      child = next
    }

    // Rebuild device list
    if (bluetoothPowered && devices.length > 0) {
      devices.forEach(device => {
        const deviceBox = new Gtk.Box({
          spacing: 12,
          hexpand: true,
        })
        deviceBox.add_css_class("device-row")

        // Device icon and name
        const iconLabel = new Gtk.Label({ label: getDeviceIcon(device.name) })
        iconLabel.add_css_class("device-icon")
        deviceBox.append(iconLabel)

        const nameLabel = new Gtk.Label({ label: device.name, hexpand: true, xalign: 0 })
        nameLabel.add_css_class("device-name")
        deviceBox.append(nameLabel)

        // Connect/Disconnect button
        const actionBtn = new Gtk.Button()
        actionBtn.add_css_class("device-action-btn")
        if (device.connected) {
          actionBtn.add_css_class("disconnect")
          actionBtn.label = "Disconnect"
        } else {
          actionBtn.add_css_class("connect")
          actionBtn.label = "Connect"
        }
        actionBtn.connect("clicked", () => {
          if (device.connected) {
            GLib.spawn_command_line_async(`bluetoothctl disconnect ${device.mac}`)
          } else {
            GLib.spawn_command_line_async(`bluetoothctl connect ${device.mac}`)
          }
          // Refresh after a short delay to allow connection to complete
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            refreshDevices()
            return GLib.SOURCE_REMOVE
          })
        })
        deviceBox.append(actionBtn)

        deviceListBox.append(deviceBox)
      })
    } else if (bluetoothPowered) {
      const emptyLabel = new Gtk.Label({ label: "No paired devices" })
      emptyLabel.add_css_class("empty-label")
      deviceListBox.append(emptyLabel)
    } else {
      const offLabel = new Gtk.Label({ label: "Bluetooth is off" })
      offLabel.add_css_class("empty-label")
      deviceListBox.append(offLabel)
    }

    // Update power toggle button
    const oldBtn = toggleBtnContainer.get_first_child()
    if (oldBtn) toggleBtnContainer.remove(oldBtn)

    const toggleBtn = new Gtk.Button()
    toggleBtn.add_css_class("toggle-btn")
    if (bluetoothPowered) toggleBtn.add_css_class("active")
    toggleBtn.label = bluetoothPowered ? "ON" : "OFF"
    toggleBtn.connect("clicked", () => {
      if (bluetoothPowered) {
        GLib.spawn_command_line_async("bluetoothctl power off")
      } else {
        GLib.spawn_command_line_async("bluetoothctl power on")
      }
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        refreshDevices()
        return GLib.SOURCE_REMOVE
      })
    })
    toggleBtnContainer.append(toggleBtn)
  }

  // Initial population
  refreshDevices()

  const win = (
    <window
      visible={false}
      namespace="ags-bluetooth-popup"
      name="bluetooth-popup"
      cssClasses={["BluetoothPopup"]}
      anchor={TOP | RIGHT}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
    >
      <box cssClasses={["bluetooth-popup-content"]} orientation={Gtk.Orientation.VERTICAL}>
        <box cssClasses={["bluetooth-header"]}>
          <label label="󰂯 Bluetooth" cssClasses={["popup-title"]} hexpand />
          {toggleBtnContainer}
        </box>

        <box cssClasses={["devices-section"]} orientation={Gtk.Orientation.VERTICAL}>
          <label label="Paired Devices" cssClasses={["section-title"]} xalign={0} />
          {deviceListBox}
        </box>

        <box cssClasses={["controls-section"]}>
          <button
            cssClasses={["settings-btn"]}
            hexpand
            onClicked={() => {
              GLib.spawn_command_line_async("plasma-open-settings kcm_bluetooth")
              closeAllPopups()
            }}
          >
            <label label=" Open Settings" />
          </button>
        </box>
      </box>
    </window>
  ) as Astal.Window

  // Refresh devices when popup becomes visible
  win.connect("notify::visible", () => {
    if (win.visible) {
      refreshDevices()
    }
  })

  // Escape key to close
  const keyController = new Gtk.EventControllerKey()
  keyController.connect("key-pressed", (_ctrl: any, keyval: number) => {
    if (keyval === Gdk.KEY_Escape) {
      closeAllPopups()
      return true
    }
    return false
  })
  win.add_controller(keyController)

  return win
}

function Bluetooth() {
  // Poll bluetooth status every 2 seconds
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

  // Icons: 󰂲 off, 󰂯 on/disconnected, 󰂱 connected
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

function Network() {
  // Poll wifi status every 2 seconds
  const wifiStatus = createPoll({ enabled: false, connected: false, signal: 0 }, 2000, () => {
    const enabled = isWifiEnabled()
    let connected = false
    let signal = 0
    if (enabled) {
      const connName = getCurrentWifiConnection()
      connected = connName.length > 0
      if (connected) {
        // Get signal strength of active connection
        const [ok, stdout] = GLib.spawn_command_line_sync("nmcli -t -f SIGNAL device wifi list")
        if (ok) {
          const output = new TextDecoder().decode(stdout)
          const lines = output.trim().split("\n")
          // First active network's signal
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

  // Icons based on state
  const getIcon = (status: { enabled: boolean; connected: boolean; signal: number }) => {
    if (!status.enabled) return "󰤭"  // WiFi disabled
    if (!status.connected) return "󰤯"  // WiFi on but not connected
    // Connected - show signal strength
    if (status.signal >= 80) return "󰤨"
    if (status.signal >= 60) return "󰤥"
    if (status.signal >= 40) return "󰤢"
    if (status.signal >= 20) return "󰤟"
    return "󰤯"
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

function SystemTray() {
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

function Bar({ monitor }: { monitor: Gdk.Monitor }) {
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
