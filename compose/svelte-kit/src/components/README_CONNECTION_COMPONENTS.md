# Connection Components Guide

This directory contains multiple connection-related components. This guide helps you choose the right one for your use case.

## Components Overview

### 1. ConnectionModal.svelte ⭐ **RECOMMENDED FOR MOST CASES**

**Purpose**: Quick, user-friendly connection dialog

**Best For:**
- Nav bar "Connect" buttons
- First-run connection wizard
- Quick reconnection
- Mobile-friendly interfaces
- Casual/consumer users

**Features:**
- ✅ Tabbed interface (Serial, TCP, UDP)
- ✅ Serial port auto-scanning
- ✅ One-click presets
- ✅ Theme-aware styling
- ✅ Mobile responsive
- ✅ No configuration persistence

**Usage:**
```svelte
<script>
  import ConnectionModal from './ConnectionModal.svelte';
  let showModal = $state(false);
</script>

<button on:click={() => showModal = true}>Connect</button>

<ConnectionModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onConnect={(config) => console.log('Connected:', config)}
/>
```

**When NOT to use:**
- Need persistent configuration storage
- Need auto-reconnect on app start
- Need fine-grained settings (baud rate, etc.)

---

### 2. ConnectionSettings.svelte

**Purpose**: Comprehensive connection configuration page

**Best For:**
- Settings/integrations page
- Advanced configuration needs
- Power users who need control
- Persistent configuration storage
- Auto-detection and monitoring

**Features:**
- ✅ Saves to database
- ✅ Auto-detect serial ports
- ✅ Baud rate selection
- ✅ UDP server/client modes
- ✅ Real-time status monitoring
- ✅ Reconnect controls
- ❌ Not a modal (embedded component)

**Usage:**
```svelte
<script>
  import ConnectionSettings from './ConnectionSettings.svelte';
</script>

<div class="settings-page">
  <h1>Connection Settings</h1>
  <ConnectionSettings />
</div>
```

**When NOT to use:**
- Need quick connection UI
- Building modal dialogs
- Limited screen space

---

### 3. SerialPortModal.svelte ⚠️ **LEGACY - Consider Migrating**

**Purpose**: Serial-only connection modal

**Status:** Legacy component, consider migrating to `ConnectionModal`

**Features:**
- ✅ Serial port selection only
- ❌ No TCP/UDP support
- ❌ No presets
- ❌ Limited features

**Migration Path:**
Replace with `ConnectionModal` and use only the Serial tab.

**Old code:**
```svelte
<SerialPortModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onSelectPort={(port) => console.log('Selected:', port)}
/>
```

**New code:**
```svelte
<ConnectionModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onConnect={(config) => {
    // config.port contains the selected port
    console.log('Selected:', config.port);
  }}
/>
```

---

## Decision Tree

```
Need to connect to vehicle?
│
├─ Quick/Simple UI needed?
│  │
│  ├─ YES → Use ConnectionModal
│  │         - Nav bar buttons
│  │         - First-run wizard
│  │         - Quick reconnect
│  │
│  └─ NO (need detailed config)
│     │
│     └─ Use ConnectionSettings
│        - Settings page
│        - Advanced users
│        - Persistent config
│
└─ Only Serial connection?
   │
   ├─ YES → Use ConnectionModal (Serial tab)
   │         - Replace SerialPortModal
   │
   └─ NO (need TCP/UDP too)
      │
      └─ Use ConnectionModal
         - All transports in one UI
```

## Use Case Matrix

| Use Case | Component | Why |
|----------|-----------|-----|
| Nav bar connect button | `ConnectionModal` | Quick access, non-intrusive |
| First-run setup | `ConnectionModal` | User-friendly, guided |
| Settings page | `ConnectionSettings` | Full config, persistence |
| Mobile app | `ConnectionModal` | Responsive, touch-friendly |
| Kiosk/embedded | `ConnectionSettings` | Auto-reconnect, monitoring |
| Power user config | `ConnectionSettings` | Advanced options, baud rates |
| Quick test/demo | `ConnectionModal` | Fast setup, presets |
| Production deployment | `ConnectionSettings` | Reliable, persistent |

## Common Patterns

### Pattern A: Quick Connect + Advanced Settings

Offer both components in different parts of the app:

```svelte
<!-- In main layout -->
<nav>
  <button on:click={() => showQuickConnect = true}>
    Quick Connect
  </button>
</nav>

<ConnectionModal
  isOpen={showQuickConnect}
  onClose={() => showQuickConnect = false}
  onConnect={handleConnect}
/>

<!-- In settings page -->
<div class="settings">
  <h2>Connection Configuration</h2>
  <ConnectionSettings />
</div>
```

**Benefits:**
- Quick access for casual users
- Deep configuration for power users
- Best of both worlds

### Pattern B: Progressive Disclosure

Start simple, reveal complexity as needed:

```svelte
<script>
  let showSimple = $state(true);
  let showAdvanced = $state(false);
</script>

{#if showSimple}
  <ConnectionModal
    isOpen={true}
    onClose={() => showSimple = false}
    onConnect={handleConnect}
  />
  
  <button on:click={() => {
    showSimple = false;
    showAdvanced = true;
  }}>
    Advanced Settings
  </button>
{/if}

{#if showAdvanced}
  <ConnectionSettings />
{/if}
```

### Pattern C: Context-Aware

Show different UIs based on context:

```svelte
<script>
  import { deviceType } from '$lib/stores/device';
  
  $: isMobile = $deviceType === 'mobile';
</script>

{#if isMobile}
  <!-- Always use modal on mobile -->
  <ConnectionModal ... />
{:else}
  <!-- Use embedded settings on desktop -->
  <ConnectionSettings />
{/if}
```

## API Endpoints Used

### ConnectionModal
- `POST /api/mavlink/list_ports` - List serial ports
- `POST /api/mavlink/connect` - Quick connect

### ConnectionSettings
- `GET /api/mavlink/connection` - Get config + status
- `POST /api/mavlink/connection` - Update config
- `DELETE /api/mavlink/connection` - Force reconnect
- `GET /api/mavlink/connection/ports` - List ports
- `POST /api/mavlink/connection/ports/detect` - Auto-detect
- `GET /api/mavlink/connection/status` - Status polling

## Documentation Links

- 📘 [Quick Start Guide](../../QUICK_START_CONNECTION.md)
- 📖 [Integration Guide](../../CONNECTION_MODAL_INTEGRATION.md)
- 🏗️ [Implementation Summary](../../CONNECTION_IMPLEMENTATION_SUMMARY.md)
- 🔧 [MAVLink Connection Docs](../../MAVLINK_CONNECTION.md)
- 🧪 [Test Page](/test-connection)

## Examples

### Example 1: Simple Connect Button
```svelte
<script lang="ts">
  import ConnectionModal from './ConnectionModal.svelte';
  let show = $state(false);
</script>

<button on:click={() => show = true}>Connect</button>
<ConnectionModal
  isOpen={show}
  onClose={() => show = false}
  onConnect={(c) => console.log(c)}
/>
```

### Example 2: Status + Connect
```svelte
<script lang="ts">
  import ConnectionModal from './ConnectionModal.svelte';
  import { connectionStatus } from '$lib/stores/mavlink';
  
  let show = $state(false);
</script>

<div class="status-bar">
  <span class={$connectionStatus.state}>{$connectionStatus.state}</span>
  <button on:click={() => show = true}>
    {$connectionStatus.state === 'connected' ? 'Reconnect' : 'Connect'}
  </button>
</div>

<ConnectionModal
  isOpen={show}
  onClose={() => show = false}
  onConnect={handleConnect}
/>
```

### Example 3: Settings Page
```svelte
<script lang="ts">
  import ConnectionSettings from './ConnectionSettings.svelte';
</script>

<div class="page">
  <h1>MAVLink Connection</h1>
  <p>Configure your flight controller connection</p>
  <ConnectionSettings />
</div>
```

## FAQ

**Q: Which component should I use for my app?**
A: Start with `ConnectionModal` for simplicity. Add `ConnectionSettings` later if needed.

**Q: Can I use both components in the same app?**
A: Yes! Use `ConnectionModal` for quick access and `ConnectionSettings` in settings.

**Q: Will ConnectionModal save my settings?**
A: No, it's ephemeral. Use `ConnectionSettings` for persistent configuration.

**Q: Can I customize the presets?**
A: Yes, edit the preset buttons in `ConnectionModal.svelte`.

**Q: What about SerialPortModal?**
A: It's legacy. Migrate to `ConnectionModal` when possible.

**Q: Does ConnectionModal work on mobile?**
A: Yes, it has a responsive design optimized for touch.

**Q: Can I use ConnectionModal without the other transports?**
A: Yes, but it shows all tabs. Just tell users to use the Serial tab.

## Support

For questions or issues:
1. Check this README
2. Read the integration guide
3. Try the test page at `/test-connection`
4. Review the MAVLink connection docs
5. Check browser console for errors
