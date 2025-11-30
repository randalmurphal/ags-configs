import app from "ags/gtk4/app"
import { createBinding, For, onCleanup } from "ags"
import { createPoll } from "ags/time"
import Astal from "gi://Astal?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import GLib from "gi://GLib"
import AstalHyprland from "gi://AstalHyprland"
import AstalWp from "gi://AstalWp"

function Workspaces() {
  const hypr = AstalHyprland.get_default()
  const workspaces = createBinding(hypr, "workspaces")
  const focused = createBinding(hypr, "focusedWorkspace")

  return (
    <box className="workspaces">
      <For each={workspaces}>
        {(ws) => {
          if (ws.id <= 0 || ws.id > 10) return null

          const isActive = focused((fw) => fw?.id === ws.id)
          const hasClients = ws.get_clients().length > 0

          return (
            <button
              className={isActive ? "active" : hasClients ? "occupied" : ""}
              onClicked={() => hypr.dispatch("workspace", String(ws.id))}
            >
              <label label={String(ws.id)} />
            </button>
          )
        }}
      </For>
    </box>
  )
}

function Clock() {
  const time = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local().format("%H:%M")!
  })

  const date = createPoll("", 60000, () => {
    return GLib.DateTime.new_now_local().format("%a, %b %d")!
  })

  return (
    <box className="clock">
      <label className="time" label={time} />
      <label className="date" label={date} />
    </box>
  )
}

function Audio() {
  const wp = AstalWp.get_default()
  const speaker = wp?.audio?.defaultSpeaker

  if (!speaker) {
    return <box className="audio"><label label="No Audio" /></box>
  }

  const volume = createBinding(speaker, "volume")
  const muted = createBinding(speaker, "mute")

  return (
    <button
      className={muted((m) => m ? "audio muted" : "audio")}
      onClicked={() => speaker.set_mute(!speaker.mute)}
    >
      <box>
        <label
          className="icon"
          label={muted((m) => m ? "󰖁" : "󰕾")}
        />
        <label
          className="volume"
          label={volume((v) => `${Math.round(v * 100)}%`)}
        />
      </box>
    </button>
  )
}

function SystemIndicators() {
  return (
    <box className="system-indicators">
      <Audio />
    </box>
  )
}

export default function Bar({ gdkmonitor }: { gdkmonitor: Gdk.Monitor }) {
  // Debug: log the monitor connector
  const monitorName = gdkmonitor.connector
  console.log("Creating bar for monitor:", monitorName)

  let win: Astal.Window
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  onCleanup(() => {
    win?.destroy()
  })

  return (
    <window
      $={(self) => (win = self)}
      visible
      name={`bar-${monitorName}`}
      className="Bar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox>
        <box $type="start" halign={Gtk.Align.START}>
          <Workspaces />
        </box>
        <box $type="center">
          <Clock />
        </box>
        <box $type="end" halign={Gtk.Align.END}>
          <SystemIndicators />
        </box>
      </centerbox>
    </window>
  )
}
