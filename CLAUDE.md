# AGS Desktop Shell Configuration

Custom AGS (Aylur's GTK Shell) v3 configuration for Hyprland desktop environment with a macOS-inspired dark purple aesthetic.

## Stack

| Component | Technology |
|-----------|------------|
| Shell Framework | AGS v3 (GTK4 + TypeScript) |
| Window Manager | Hyprland |
| Display Protocol | Wayland |
| Type Definitions | `@girs/` (auto-generated) |
| Runtime | GJS (GNOME JavaScript) |

## Running AGS

```bash
# Standard run (from this directory)
GI_TYPELIB_PATH=/usr/local/lib64/girepository-1.0 ags run

# Kill and restart
pkill -9 gjs && GI_TYPELIB_PATH=/usr/local/lib64/girepository-1.0 ags run

# Toggle launcher via hyprctl
ags toggle launcher
```

## Design Philosophy

### Visual Style
- **macOS Spotlight-inspired**: Clean, minimal, pill-shaped elements
- **Dark theme with purple accents**: Deep backgrounds with vibrant purple highlights
- **Modern opacity**: Semi-transparent backgrounds (~85%) for depth
- **Blur effects**: Hyprland layer blur for glass-like appearance

### Color Palette

| Variable | Hex | Usage |
|----------|-----|-------|
| `$purple-primary` | `#9d4edd` | Primary accent, borders, highlights |
| `$purple-secondary` | `#7b2cbf` | Secondary accent, hover states |
| `$purple-dark` | `#5a189a` | Deep accent |
| `$bg-darker` | `#0d0d0d` | Darkest background |
| `$bg-dark` | `#121218` | Primary background |
| `$bg-medium` | `#1a1a2e` | Secondary background |
| `$text-primary` | `#e0e0e0` | Primary text |
| `$text-secondary` | `#a0a0a0` | Muted text |
| `$text-dim` | `#666` | Placeholder, disabled |

### Design Decisions

1. **Launcher**: macOS Spotlight-style search
   - Pill-shaped (24px border-radius)
   - 2px solid purple border
   - Dynamic height (shrinks with fewer results)
   - Debounced search (50ms) to prevent lag
   - Lazy app initialization to avoid startup cost

2. **Status Bar**: Minimal top bar
   - Workspace indicators per-monitor
   - Client icons for current workspace
   - System tray with popups (audio, brightness, wifi, bluetooth)
   - Click-outside-to-close for popups via backdrop layer

3. **Popups**: Consistent control panels
   - Rounded corners (16px)
   - Purple accent colors
   - Toggle switches with ON/OFF states
   - Settings buttons linking to KDE system settings

## File Structure

```
.
├── app.tsx           # Main entry, bar, popups, system tray
├── launcher.tsx      # Spotlight-style app launcher
├── style.scss        # All styles (SCSS with variables)
├── widget/           # Additional widgets (unused Bar.tsx)
├── @girs/            # Type definitions (gitignored)
├── screenshots/      # Reference screenshots
└── CLAUDE.md         # This file
```

## Key Patterns

### Window Creation (Layer Shell)
```typescript
const window = new Astal.Window({
  name: "unique-name",
  namespace: "ags-unique-name",  // For Hyprland layer rules
  application: app,
  anchor: Astal.WindowAnchor.TOP,
  exclusivity: Astal.Exclusivity.IGNORE,
  keymode: Astal.Keymode.ON_DEMAND,
  visible: false,
})
```

### Reactive Bindings
```typescript
const value = createBinding(object, "property")
// Use in JSX:
<label label={value((v) => `${v}%`)} />
```

### Polling
```typescript
const data = createPoll(initialValue, intervalMs, () => fetchData())
```

### Debouncing with GLib
```typescript
let timer: number | null = null
function debouncedFn() {
  if (timer) GLib.source_remove(timer)
  timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
    doWork()
    timer = null
    return GLib.SOURCE_REMOVE
  })
}
```

## Hyprland Integration

### Keybinds (in hyprland.conf)
```
bind = $mainMod, D, exec, ags toggle launcher
bind = ALT, SPACE, exec, ags toggle launcher
```

### Layer Rules (for blur effects)
```
layerrule = blur, ags-.*
layerrule = ignorezero, ags-.*
```

### Workspace-to-Monitor Mapping
```typescript
const WORKSPACE_MONITOR_MAP: Record<string, number[]> = {
  "DP-3": [1, 2, 3, 10],      // Center (primary)
  "DP-1": [4, 5, 6],          // Left
  "HDMI-A-1": [7, 8, 9],      // Right
}
```

## Future Work

- [ ] Split `app.tsx` into modular components:
  - `widgets/bar/` - Workspaces, Clients, Clock, SystemTray
  - `widgets/popups/` - Audio, Brightness, WiFi, Bluetooth
  - `lib/` - Shared utilities, popup management
- [ ] Add window representation to bar (like macOS dock highlighting)
- [ ] Power menu widget
- [ ] Notification center
- [ ] Calendar popup for clock
- [ ] Media controls in audio popup
- [ ] VPN toggle in network popup

## Coding Style

- TypeScript with strict null checks
- Functional components where possible
- Avoid unnecessary abstractions
- CSS classes over inline styles
- Keep popup logic self-contained
- Use GLib for timers, not setTimeout (GJS limitation)

## Testing Changes

1. Make edits to source files
2. Restart AGS: `pkill -9 gjs && ags run`
3. Test functionality (keybinds, popups, etc.)
4. Check for console errors in AGS output

## Dependencies

- `ags` CLI (AGS v3)
- `astal` libraries (Apps, Hyprland, WirePlumber)
- `nmcli` for WiFi management
- `bluetoothctl` for Bluetooth
- Nerd Fonts for icons (Symbols Nerd Font)
