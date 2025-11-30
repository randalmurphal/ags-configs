import app from "ags/gtk4/app"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import GLib from "gi://GLib"
import AstalWp from "gi://AstalWp"
import { createBinding } from "ags"
import { closeAllPopups } from "../../../lib/popup-manager"

// Audio popup - uses direct visibility toggle
export function AudioPopup() {
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
