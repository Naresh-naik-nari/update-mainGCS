# Quick Start: Connection Modal

## 5-Minute Integration

### Step 1: Import the Component

```svelte
<script lang="ts">
  import ConnectionModal from '$lib/components/ConnectionModal.svelte';
  
  let showModal = $state(false);
</script>
```

### Step 2: Add the Button

```svelte
<button on:click={() => showModal = true}>
  <i class="fas fa-plug"></i>
  Connect to Vehicle
</button>
```

### Step 3: Add the Modal

```svelte
<ConnectionModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onConnect={(config) => {
    console.log('Connected:', config);
    // Your connection logic here
  }}
/>
```

### Complete Example

```svelte
<script lang="ts">
  import ConnectionModal from '$lib/components/ConnectionModal.svelte';
  
  let showModal = $state(false);
  
  function handleConnect(config: any) {
    console.log('Vehicle connected with:', config);
    showModal = false;
  }
</script>

<nav>
  <button class="connect-btn" on:click={() => showModal = true}>
    Connect
  </button>
</nav>

<ConnectionModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onConnect={handleConnect}
/>

<style>
  .connect-btn {
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
```

## Features You Get

✅ **Serial (USB) Connection**
- Auto-scanning of available ports
- Device information display
- One-click selection

✅ **TCP Connection**
- Simple IP/port form
- SITL presets included
- Network connectivity

✅ **UDP Connection**
- Advanced configuration
- Multiple preset configurations
- Server/client modes

✅ **Theme Integration**
- Automatic dark/light mode
- Matches your app's colors
- Responsive design

## Test It

1. Start your dev server: `npm run dev`
2. Navigate to `/test-connection`
3. Click "Connect" and test each transport type

## Next Steps

- Read the [full integration guide](CONNECTION_MODAL_INTEGRATION.md)
- Review the [implementation summary](CONNECTION_IMPLEMENTATION_SUMMARY.md)
- Check the [MAVLink connection docs](MAVLINK_CONNECTION.md)

## Common Patterns

### Pattern 1: Nav Bar Button

```svelte
<!-- In your layout -->
<nav class="main-nav">
  <a href="/">Home</a>
  <a href="/mission">Mission</a>
  <button on:click={() => showConnect = true}>Connect</button>
</nav>

<ConnectionModal
  isOpen={showConnect}
  onClose={() => showConnect = false}
  onConnect={handleConnect}
/>
```

### Pattern 2: Status Indicator + Connect

```svelte
<script>
  let status = $state('disconnected');
  let showModal = $state(false);
  
  async function handleConnect(config) {
    // Connection will happen via API
    // Poll for status updates
    const interval = setInterval(async () => {
      const res = await fetch('/api/mavlink/connection/status');
      const data = await res.json();
      status = data.state;
      if (status === 'connected') clearInterval(interval);
    }, 1000);
  }
</script>

<div class="connection-status">
  <span class="indicator {status}"></span>
  <span>{status}</span>
  <button on:click={() => showModal = true}>
    {status === 'connected' ? 'Reconnect' : 'Connect'}
  </button>
</div>

<ConnectionModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onConnect={handleConnect}
/>
```

### Pattern 3: First-Run Experience

```svelte
<script>
  import { onMount } from 'svelte';
  
  let showWelcome = $state(false);
  let hasConnected = $state(false);
  
  onMount(() => {
    const connected = localStorage.getItem('hasConnected');
    if (!connected) {
      showWelcome = true;
    }
  });
  
  function handleConnect(config) {
    console.log('Connected:', config);
    localStorage.setItem('hasConnected', 'true');
    hasConnected = true;
  }
</script>

{#if showWelcome && !hasConnected}
  <div class="welcome-screen">
    <h1>Welcome to Sidak GCS</h1>
    <p>Let's connect to your vehicle</p>
    <ConnectionModal
      isOpen={true}
      onClose={() => showWelcome = false}
      onConnect={handleConnect}
    />
  </div>
{:else}
  <!-- Main app -->
{/if}
```

## API Reference

### Props

```typescript
interface Props {
  isOpen: boolean;           // Controls modal visibility
  onClose: () => void;       // Called when modal closes
  onConnect: (config: ConnectionConfig) => void;  // Called on successful connection
}

interface ConnectionConfig {
  type: 'serial' | 'tcp' | 'udp';
  port?: string;           // For serial
  host?: string;           // For tcp/udp
  portNumber?: number;     // For tcp/udp
  bindPort?: number;       // For udp
}
```

### Events

```typescript
onConnect(config: ConnectionConfig)
// Called when connection is initiated
// config contains the connection parameters

onClose()
// Called when modal needs to close
// (backdrop click, escape key, cancel button)
```

## Troubleshooting

### Modal doesn't show
- Check `isOpen` prop is true
- Verify component is imported correctly
- Check browser console for errors

### Ports list is empty
- Ensure USB device is connected
- Check user has serial port permissions
- Try clicking the Refresh button

### Connection fails
- Verify device is powered on
- Check network connectivity (TCP/UDP)
- Review connection parameters
- Check browser console for API errors

## Pro Tips

💡 **Keyboard Shortcuts**
- Press `Escape` to close the modal
- Use `Tab` to navigate between inputs
- Press `Enter` on a port to select it

💡 **Mobile Support**
- Modal automatically adapts to mobile screens
- Touch-friendly buttons and inputs
- Vertical tabs on narrow screens

💡 **Presets**
- Click preset buttons to auto-fill forms
- Customize presets in `ConnectionModal.svelte`
- Add your common configurations

💡 **Theme**
- Modal automatically inherits your theme
- Uses customization stores for colors
- Supports dark and light modes

## Need Help?

- 📖 [Full Integration Guide](CONNECTION_MODAL_INTEGRATION.md)
- 🏗️ [Implementation Details](CONNECTION_IMPLEMENTATION_SUMMARY.md)
- 🔧 [MAVLink Connection Docs](MAVLINK_CONNECTION.md)
- 🧪 [Test Page](/test-connection)
