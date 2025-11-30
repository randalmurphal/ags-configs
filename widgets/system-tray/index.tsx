import Audio from "./Audio"
import Brightness from "./Brightness"
import Bluetooth from "./Bluetooth"
import Caffeine from "./Caffeine"
import Power from "./Power"

export default function SystemTray() {
  return (
    <box cssClasses={["systray"]}>
      <Caffeine />
      <Audio />
      <Brightness />
      <Bluetooth />
      <Power />
    </box>
  )
}
