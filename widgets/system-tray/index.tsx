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
