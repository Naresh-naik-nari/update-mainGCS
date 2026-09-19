# Connection Modal Integration Guide

This guide explains how to integrate the new `ConnectionModal.svelte` component into your Sidak GCS application.

## What's New

### API Endpoints

Two new API endpoints have been created to support the connection modal:

#### 1. `/api/mavlink/list_ports` (POST)
- **Purpose**: Lists all available serial ports with device information
- **Response**: Array of `SerialPortInfo` objects
- **Location**: `src/routes/api/mavlink/list_ports/+server.ts`

```typescript
interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}
```

#### 2. `/api/mavlink/connect` (POST)
- **Purpose**: Establishes MAVLink connection with specified transport configuration
- **Request Body**: `ConnectionConfig` object
- **Location**: `src/routes/api/mavlink/connect/+server.ts`

```typescript
interface ConnectionConfig {
  type: 'serial' | 'tcp' | 'udp';
  port?: string;           // For serial
  host?: string;           // For tcp/udp
  portNumber?: number;     // For tcp/udp
  bindPort?: number;       // For udp
}
```

**Example requests:**

```javascript
// Serial connection
{
  "type": "serial",
  "port": "/dev/ttyACM0"
}

// TCP connection
{
  "type": "tcp",
  "host": "192.168.1.100",
  "portNumber": 5760
}

// UDP connection
{
  "type": "udp",
  "host": "192.168.0.7",
  "portNumber": 20108,
  "bindPort": 8234
}
```

### Component

**`ConnectionModal.svelte`**
- **Location**: `src/components/ConnectionModal.svelte`
- **Features**:
  - Tabbed interface for Serial, TCP, and UDP connections
  - Auto-scanning of serial ports with device information
  - Preset configurations for common setups
  - Theme integration with customization stores
  - Responsive design with mobile support

## Integration Steps

### 1. Basic Usage

Import and use the connection modal in any page or component:

```svelte
<script lang="ts">
  import ConnectionModal from '$lib/components/ConnectionModal.svelte';
  
  let showConnectionModal = $state(false);
  
  function handleConnect(config) {
    console.log('Connected with config:', config);
    // Handle successful connection
  }
  
  function openModal() {
    showConnectionModal = true;
  }
  
  function closeModal() {
    showConnectionModal = false;
  }
</script>

<button on:click={openModal}>
  Connect to Vehicle
</button>

<ConnectionModal
  isOpen={showConnectionModal}
  onClose={closeModal}
  onConnect={handleConnect}
/>
```

### 2. Integration in Main Layout

To add a global "Connect" button in your main layout:

**`src/routes/+layout.svelte`** (or your main app component):

```svelte
<script lang="ts">
  import ConnectionModal from '$lib/components/ConnectionModal.svelte';
  import { connectionStatus } from '$lib/stores/mavlinkStore'; // If you have this
  
  let showConnectionModal = $state(false);
  
  function handleConnect(config) {
    console.log('Vehicle connected:', config);
    // Optional: Update connection status store
  }
</script>

<nav class="main-nav">
  <!-- Other nav items -->
  
  <button 
    class="connect-btn" 
    on:click={() => showConnectionModal = true}
  >
    <i class="fas fa-plug"></i>
    Connect
  </button>
</nav>

<!-- Your app content -->
<slot />

<ConnectionModal
  isOpen={showConnectionModal}
  onClose={() => showConnectionModal = false}
  onConnect={handleConnect}
/>
```

### 3. Integration with Existing Connection Status

If you want to show connection status and allow reconnection:

```svelte
<script lang="ts">
  import ConnectionModal from '$lib/components/ConnectionModal.svelte';
  import { onMount } from 'svelte';
  
  let connectionStatus = $state<any>(null);
  let showConnectionModal = $state(false);
  
  onMount(async () => {
    // Load initial connection status
    await loadConnectionStatus();
    
    // Poll for status updates
    setInterval(loadConnectionStatus, 2000);
  });
  
  async function loadConnectionStatus() {
    try {
      const response = await fetch('/api/mavlink/connection/status');
      if (response.ok) {
        connectionStatus = await response.json();
      }
    } catch (error) {
      console.error('Failed to load connection status:', error);
    }
  }
  
  function handleConnect(config) {
    console.log('Connected:', config);
    loadConnectionStatus();
  }
  
  function getStatusColor(state: string) {
    switch (state) {
      case 'connected': return '#10b981';
      case 'connecting': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  }
</script>

<div class="connection-control">
  {#if connectionStatus}
    <div class="status-indicator">
      <span 
        class="status-dot" 
        style="background: {getStatusColor(connectionStatus.state)}"
      ></span>
      <span class="status-text">{connectionStatus.state}</span>
    </div>
  {/if}
  
  <button on:click={() => showConnectionModal = true}>
    {connectionStatus?.state === 'connected' ? 'Reconnect' : 'Connect'}
  </button>
</div>

<ConnectionModal
  isOpen={showConnectionModal}
  onClose={() => showConnectionModal = false}
  onConnect={handleConnect}
/>
```

### 4. Replace Existing SerialPortModal

If you're currently using `SerialPortModal.svelte`, you can replace it:

**Before:**
```svelte
<SerialPortModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onSelectPort={(port) => console.log('Selected:', port)}
/>
```

**After:**
```svelte
<ConnectionModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onConnect={(config) => console.log('Connected:', config)}
/>
```

### 5. Adding to Integrations Page

If you have an integrations or settings page:

**`src/routes/integrations/+page.svelte`**:

```svelte
<script lang="ts">
  import ConnectionModal from '$lib/components/ConnectionModal.svelte';
  import ConnectionSettings from '$lib/components/ConnectionSettings.svelte';
  
  let showQuickConnect = $state(false);
</script>

<div class="integrations-page">
  <section class="quick-connect">
    <h2>Quick Connect</h2>
    <p>Quickly connect to your flight controller</p>
    <button on:click={() => showQuickConnect = true}>
      <i class="fas fa-bolt"></i>
      Quick Connect
    </button>
  </section>
  
  <section class="advanced-settings">
    <h2>Advanced Connection Settings</h2>
    <ConnectionSettings />
  </section>
</div>

<ConnectionModal
  isOpen={showQuickConnect}
  onClose={() => showQuickConnect = false}
  onConnect={(config) => {
    console.log('Quick connected:', config);
  }}
/>
```

## Customization

### Preset Configurations

You can customize the preset configurations in `ConnectionModal.svelte`:

```svelte
<!-- UDP presets example -->
<button class="preset-btn" on:click={() => { 
  udpHost = '192.168.0.7'; 
  udpPort = 20108; 
  udpBindPort = 8234; 
}}>
  My Custom Config (192.168.0.7:20108)
</button>
```

### Styling

The modal uses CSS custom properties that integrate with your theme:

```css
--primaryColor: Your primary background color
--secondaryColor: Your secondary background color
--tertiaryColor: Your tertiary/border color
--fontColor: Your font color
```

You can override styles by adding custom CSS:

```svelte
<ConnectionModal
  isOpen={showModal}
  onClose={closeModal}
  onConnect={handleConnect}
/>

<style>
  :global(.modal-container) {
    /* Your custom styles */
    border-radius: 20px;
  }
</style>
```

## Comparison: ConnectionModal vs ConnectionSettings

| Feature | ConnectionModal | ConnectionSettings |
|---------|----------------|-------------------|
| **Use Case** | Quick connection UI | Advanced configuration |
| **Interface** | Modal dialog | Embedded component |
| **Complexity** | Simple, streamlined | Full settings panel |
| **Presets** | Yes (quick access) | No |
| **Persistence** | No (ephemeral) | Yes (saves to database) |
| **Auto-detect** | Manual refresh | Automatic polling |
| **Best For** | First-time users, quick reconnect | Power users, fine-tuning |

### When to Use Each

**Use `ConnectionModal`** when:
- You want a quick, non-intrusive connection flow
- You're building a first-run experience
- You need a "Connect" button in the nav bar
- Users need to switch connections frequently

**Use `ConnectionSettings`** when:
- You have a dedicated settings/integrations page
- Users need advanced configuration (baud rates, bind addresses, etc.)
- You want persistent configuration storage
- You need auto-detection and connection monitoring

**Use Both** when:
- Offer `ConnectionModal` for quick access (nav bar button)
- Provide `ConnectionSettings` in settings page for advanced users

## Error Handling

The modal includes basic error handling with alerts. For production, you may want to enhance this:

```svelte
<script lang="ts">
  import ConnectionModal from '$lib/components/ConnectionModal.svelte';
  import Toast from '$lib/components/Toast.svelte';
  
  let showModal = $state(false);
  let toastMessage = $state('');
  let toastType = $state<'success' | 'error'>('success');
  
  async function handleConnect(config) {
    try {
      const response = await fetch('/api/mavlink/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        toastMessage = 'Connected successfully!';
        toastType = 'success';
      } else {
        const error = await response.text();
        toastMessage = `Connection failed: ${error}`;
        toastType = 'error';
      }
    } catch (error) {
      toastMessage = `Error: ${error}`;
      toastType = 'error';
    }
  }
</script>

<ConnectionModal
  isOpen={showModal}
  onClose={() => showModal = false}
  onConnect={handleConnect}
/>

{#if toastMessage}
  <Toast message={toastMessage} type={toastType} />
{/if}
```

## Testing

### Manual Testing Checklist

- [ ] Serial tab shows available ports
- [ ] Selecting a serial port highlights it
- [ ] Connect button is disabled without port selection
- [ ] Refresh button reloads ports
- [ ] TCP/UDP presets populate fields correctly
- [ ] Connection succeeds for each transport type
- [ ] Modal closes on successful connection
- [ ] Modal closes when clicking backdrop
- [ ] Modal closes when pressing Escape key
- [ ] Responsive design works on mobile
- [ ] Theme colors apply correctly
- [ ] Dark/light mode transitions work

### API Testing

```bash
# Test list_ports endpoint
curl -X POST http://localhost:3000/api/mavlink/list_ports

# Test serial connection
curl -X POST http://localhost:3000/api/mavlink/connect \
  -H "Content-Type: application/json" \
  -d '{"type":"serial","port":"/dev/ttyACM0"}'

# Test TCP connection
curl -X POST http://localhost:3000/api/mavlink/connect \
  -H "Content-Type: application/json" \
  -d '{"type":"tcp","host":"127.0.0.1","portNumber":5760}'

# Test UDP connection
curl -X POST http://localhost:3000/api/mavlink/connect \
  -H "Content-Type: application/json" \
  -d '{"type":"udp","host":"192.168.0.7","portNumber":20108,"bindPort":8234}'
```

## Troubleshooting

### Ports Not Showing

**Problem**: Serial ports list is empty

**Solutions**:
1. Check USB cable connection
2. Verify user has permission to access serial ports
3. Check browser console for errors
4. Verify `/api/mavlink/list_ports` endpoint is working

### Connection Fails

**Problem**: Connection attempt fails with error

**Solutions**:
1. Check network connectivity (TCP/UDP)
2. Verify flight controller is powered on
3. Check firewall settings (UDP)
4. Verify correct IP address and port
5. Check MAVLink connection supervisor logs

### Modal Doesn't Close

**Problem**: Modal remains open after connection

**Solutions**:
1. Check `onConnect` callback is calling `onClose`
2. Verify no JavaScript errors in console
3. Check `isOpen` prop is being updated

## Migration Path

If you're migrating from the old serial-only modal:

1. **Phase 1**: Add new API endpoints (already done)
2. **Phase 2**: Add `ConnectionModal.svelte` alongside existing modal
3. **Phase 3**: Update one page/component at a time
4. **Phase 4**: Once tested, remove `SerialPortModal.svelte`
5. **Phase 5**: Update documentation references

## Next Steps

1. **Test the implementation**: Use the manual testing checklist
2. **Add error handling**: Implement proper toast notifications
3. **Add connection status**: Show connection state in UI
4. **Add keyboard shortcuts**: Consider Ctrl+K for quick connect
5. **Add connection history**: Remember recent connections
6. **Add validation**: Validate IP addresses and ports before connecting

## Support

For issues or questions:
- Check the browser console for errors
- Review API endpoint responses
- Check MAVLink connection logs
- Refer to `MAVLINK_CONNECTION.md` for transport layer details
