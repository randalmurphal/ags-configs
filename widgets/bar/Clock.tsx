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
