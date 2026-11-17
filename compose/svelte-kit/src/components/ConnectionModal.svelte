<script lang="ts">
  export let isOpen = false;
  export let onClose: () => void;
  export let onConnect: (config: ConnectionConfig) => void;

  interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
  }

  interface ConnectionConfig {
    type: 'serial' | 'tcp' | 'udp';
    port?: string;
    baudRate?: number;
    host?: string;
    portNumber?: number;
    bindPort?: number;
  }

  const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

  let connectionType: 'serial' | 'tcp' | 'udp' = 'serial';
  let ports: SerialPortInfo[] = [];
  let loading = true;
  let connecting = false;
  let selectedPortPath: string | null = null;
  let selectedBaud = 115200;

  // Network settings
  let tcpHost = '192.168.1.100';
  let tcpPort = 5760;
  let udpHost = '192.168.0.7';
  let udpPort = 20108;
  let udpBindPort = 8234;

  async function loadPorts() {
    loading = true;
    try {
      const response = await fetch('/api/mavlink/list_ports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        ports = await response.json();
        // Auto-select single port
        if (ports.length === 1 && !selectedPortPath) {
          selectedPortPath = ports[0].path;
        }
      } else {
        console.error('Failed to load ports:', response.status);
      }
    } catch (error) {
      console.error('Error loading ports:', error);
    } finally {
      loading = false;
    }
  }

  async function handleConnect() {
    let config: ConnectionConfig;

    if (connectionType === 'serial') {
      if (!selectedPortPath) return;
      config = { type: 'serial', port: selectedPortPath, baudRate: selectedBaud };
    } else if (connectionType === 'tcp') {
      config = { type: 'tcp', host: tcpHost, portNumber: tcpPort };
    } else {
      config = { type: 'udp', host: udpHost, portNumber: udpPort, bindPort: udpBindPort };
    }

    connecting = true;
    try {
      const response = await fetch('/api/mavlink/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        onConnect(config);
        onClose();
      } else {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        alert(`Connection failed: ${err.error ?? response.statusText}`);
      }
    } catch (error) {
      console.error('Error connecting:', error);
      alert(`Connection error: ${error}`);
    } finally {
      connecting = false;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }

  $: if (isOpen && connectionType === 'serial') loadPorts();
</script>

{#if isOpen}
<div
  class="modal-backdrop"
  role="presentation"
  on:click={handleBackdropClick}
  on:keydown={(e) => e.key === 'Escape' && onClose()}
>
  <div
    class="modal-container"
    role="dialog"
    aria-modal="true"
    aria-label="Connect to Vehicle"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown|stopPropagation
  >
    <!-- Header -->
    <div class="modal-header">
      <h2 class="modal-title">
        <i class="fas fa-plug"></i>
        Connect to Vehicle
      </h2>
      <button class="close-btn" aria-label="Close" on:click={onClose}>
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Body -->
    <div class="modal-body">

      <!-- Tabs -->
      <div class="connection-tabs" role="tablist">
        <button
          class="tab-btn" class:active={connectionType === 'serial'}
          role="tab" aria-selected={connectionType === 'serial'}
          on:click={() => { connectionType = 'serial'; selectedPortPath = null; }}
        >
          <i class="fas fa-usb"></i> Serial (USB)
        </button>
        <button
          class="tab-btn" class:active={connectionType === 'tcp'}
          role="tab" aria-selected={connectionType === 'tcp'}
          on:click={() => connectionType = 'tcp'}
        >
          <i class="fas fa-network-wired"></i> TCP
        </button>
        <button
          class="tab-btn" class:active={connectionType === 'udp'}
          role="tab" aria-selected={connectionType === 'udp'}
          on:click={() => connectionType = 'udp'}
        >
          <i class="fas fa-broadcast-tower"></i> UDP
        </button>
      </div>

      <!-- ── Serial ── -->
      {#if connectionType === 'serial'}
        <div class="connection-content" role="tabpanel">
          <p class="hint">
            <i class="fas fa-info-circle"></i>
            Select a serial port to connect to your flight controller
          </p>

          {#if loading}
            <div class="loading">
              <i class="fas fa-spinner fa-spin"></i> Scanning ports…
            </div>
          {:else if ports.length === 0}
            <div class="no-ports">
              <i class="fas fa-exclamation-triangle"></i>
              <p>No serial ports detected</p>
              <p class="hint">Connect your flight controller via USB and click Refresh</p>
              <button class="btn btn-secondary" on:click={loadPorts}>
                <i class="fas fa-sync-alt"></i> Refresh
              </button>
            </div>
          {:else}
            <div class="port-list">
              {#each ports as port (port.path)}
                <div
                  class="port-item"
                  class:selected={selectedPortPath === port.path}
                  role="button"
                  tabindex="0"
                  on:click={() => selectedPortPath = port.path}
                  on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selectedPortPath = port.path)}
                >
                  <div class="port-icon"><i class="fas fa-microchip"></i></div>
                  <div class="port-details">
                    <div class="port-path">{port.path}</div>
                    {#if port.manufacturer}
                      <div class="port-manufacturer">{port.manufacturer}</div>
                    {/if}
                    {#if port.vendorId}
                      <div class="port-id">VID:{port.vendorId}{port.productId ? ` PID:${port.productId}` : ''}</div>
                    {/if}
                  </div>
                  {#if selectedPortPath === port.path}
                    <i class="fas fa-check-circle selected-icon"></i>
                  {/if}
                </div>
              {/each}
            </div>

            <!-- Baud rate selector -->
            <div class="baud-row">
              <span class="baud-label">Baud Rate</span>
              <div class="baud-buttons">
                {#each BAUD_RATES as baud (baud)}
                  <button
                    class="baud-btn"
                    class:active={selectedBaud === baud}
                    on:click={() => selectedBaud = baud}
                  >{baud.toLocaleString()}</button>
                {/each}
              </div>
            </div>

            <button class="refresh-btn" on:click={loadPorts}>
              <i class="fas fa-sync-alt"></i> Refresh Ports
            </button>
          {/if}
        </div>
      {/if}

      <!-- ── TCP ── -->
      {#if connectionType === 'tcp'}
        <div class="connection-content" role="tabpanel">
          <p class="hint">
            <i class="fas fa-info-circle"></i>
            Connect via TCP/IP — typically used for SITL or a MAVProxy bridge
          </p>
          <div class="network-form">
            <div class="form-group">
              <label for="tcp-host">IP Address / Hostname</label>
              <input id="tcp-host" type="text" bind:value={tcpHost}
                placeholder="192.168.1.100" class="network-input" />
            </div>
            <div class="form-group">
              <label for="tcp-port">Port</label>
              <input id="tcp-port" type="number" bind:value={tcpPort}
                placeholder="5760" class="network-input" />
            </div>
          </div>
          <div class="preset-connections">
            <p class="preset-label">Common Configurations:</p>
            <button class="preset-btn" on:click={() => { tcpHost = '192.168.1.1'; tcpPort = 5760; }}>
              WiFi Telemetry (192.168.1.1:5760)
            </button>
            <button class="preset-btn" on:click={() => { tcpHost = '127.0.0.1'; tcpPort = 5760; }}>
              Localhost SITL (127.0.0.1:5760)
            </button>
          </div>
        </div>
      {/if}

      <!-- ── UDP ── -->
      {#if connectionType === 'udp'}
        <div class="connection-content" role="tabpanel">
          <p class="hint">
            <i class="fas fa-info-circle"></i>
            Connect via UDP — used for telemetry radios and WiFi links
          </p>
          <div class="network-form">
            <div class="form-group">
              <label for="udp-host">Remote IP Address</label>
              <input id="udp-host" type="text" bind:value={udpHost}
                placeholder="192.168.1.100" class="network-input" />
              <span class="input-hint">IP address of the flight controller</span>
            </div>
            <div class="form-group">
              <label for="udp-port">Remote Port</label>
              <input id="udp-port" type="number" bind:value={udpPort}
                placeholder="14550" class="network-input" />
              <span class="input-hint">Port the FC is listening on</span>
            </div>
            <div class="form-group">
              <label for="udp-bind-port">Local Bind Port</label>
              <input id="udp-bind-port" type="number" bind:value={udpBindPort}
                placeholder="14550" class="network-input" />
              <span class="input-hint">Port to listen on locally</span>
            </div>
          </div>
          <div class="preset-connections">
            <p class="preset-label">Common Configurations:</p>
            <button class="preset-btn" on:click={() => { udpHost = '192.168.0.7'; udpPort = 8234; udpBindPort = 14550; }}>
              Your FC (192.168.0.7:8234)
            </button>
            <button class="preset-btn" on:click={() => { udpHost = '192.168.1.1'; udpPort = 14550; udpBindPort = 14550; }}>
              WiFi Telemetry (192.168.1.1:14550)
            </button>
            <button class="preset-btn" on:click={() => { udpHost = '127.0.0.1'; udpPort = 14550; udpBindPort = 14551; }}>
              SITL (127.0.0.1:14550 → 14551)
            </button>
            <button class="preset-btn" on:click={() => { udpHost = '0.0.0.0'; udpPort = 14550; udpBindPort = 14550; }}>
              Listen All (0.0.0.0:14550)
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="btn btn-secondary" on:click={onClose}>Cancel</button>
      <button
        class="btn btn-primary"
        on:click={handleConnect}
        disabled={connecting || (connectionType === 'serial' && !selectedPortPath)}
      >
        {#if connecting}
          <i class="fas fa-spinner fa-spin"></i> Connecting…
        {:else}
          <i class="fas fa-plug"></i> Connect
        {/if}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 1rem;
  }

  .modal-container {
    background: var(--primaryColor);
    border: 2px solid var(--tertiaryColor);
    border-radius: 16px;
    width: 100%;
    max-width: 580px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--tertiaryColor);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--fontColor);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 1.2rem;
    color: var(--fontColor);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-control, 6px);
  }
  .close-btn:hover { opacity: 1; }

  /* Body */
  .modal-body {
    padding: 1.5rem;
    color: var(--fontColor);
    flex: 1;
    overflow-y: auto;
  }

  /* Tabs */
  .connection-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1.25rem;
    border-bottom: 2px solid var(--tertiaryColor);
  }

  .tab-btn {
    flex: 1;
    padding: 0.6rem 0.5rem;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
    color: var(--fontColor);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    font-size: 0.875rem;
    opacity: 0.5;
    transition: opacity 0.15s;
  }
  .tab-btn:hover { opacity: 0.8; }
  .tab-btn.active { opacity: 1; border-bottom-color: #3b82f6; }

  /* Content */
  .connection-content { min-height: 180px; }

  .hint {
    font-size: 0.85rem;
    opacity: 0.7;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* Loading / empty */
  .loading {
    text-align: center;
    padding: 2.5rem;
    opacity: 0.7;
  }

  .no-ports { text-align: center; padding: 2rem; }
  .no-ports > i {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 0.75rem;
    opacity: 0.4;
    color: #f59e0b;
  }
  .no-ports p { margin: 0 0 0.25rem; font-weight: 600; }
  .no-ports .hint { justify-content: center; margin-top: 0.5rem; }

  /* Port list */
  .port-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.875rem;
  }

  .port-item {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    background: rgb(from var(--tertiaryColor) r g b / 0.5);
    border: 2px solid rgb(from var(--fontColor) r g b / 0.1);
    border-radius: var(--radius-control, 8px);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    user-select: none;
  }
  .port-item:hover { border-color: #3b82f6; }
  .port-item.selected {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
  }

  .port-icon { font-size: 1.4rem; color: #3b82f6; flex-shrink: 0; }
  .port-details { flex: 1; min-width: 0; }
  .port-path { font-weight: 700; font-size: 0.95rem; }
  .port-manufacturer { font-size: 0.8rem; opacity: 0.7; margin-top: 0.1rem; }
  .port-id { font-size: 0.7rem; opacity: 0.5; font-family: monospace; }
  .selected-icon { color: #10b981; font-size: 1.2rem; flex-shrink: 0; }

  /* Baud rate row */
  .baud-row { margin-bottom: 0.875rem; }

  .baud-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    opacity: 0.7;
    margin-bottom: 0.4rem;
  }

  .baud-buttons { display: flex; flex-wrap: wrap; gap: 0.35rem; }

  .baud-btn {
    padding: 0.3rem 0.65rem;
    background: rgb(from var(--tertiaryColor) r g b / 0.6);
    border: 1.5px solid rgb(from var(--fontColor) r g b / 0.12);
    border-radius: var(--radius-control, 6px);
    color: var(--fontColor);
    font-size: 0.78rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .baud-btn:hover { border-color: #3b82f6; }
  .baud-btn.active {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.15);
    font-weight: 700;
    color: #3b82f6;
  }

  /* Refresh */
  .refresh-btn {
    width: 100%;
    padding: 0.6rem;
    background: rgb(from var(--tertiaryColor) r g b / 0.5);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.1);
    border-radius: var(--radius-control, 8px);
    color: var(--fontColor);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    transition: opacity 0.2s;
  }
  .refresh-btn:hover { opacity: 0.75; }

  /* Network form */
  .network-form {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    margin-bottom: 1.25rem;
  }

  .form-group { display: flex; flex-direction: column; gap: 0.35rem; }
  .form-group label { font-size: 0.85rem; font-weight: 600; }

  .network-input {
    padding: 0.6rem 0.75rem;
    background: rgb(from var(--tertiaryColor) r g b / 0.6);
    border: 1.5px solid rgb(from var(--fontColor) r g b / 0.12);
    border-radius: var(--radius-control, 8px);
    color: var(--fontColor);
    font-size: 0.9rem;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  .network-input:focus { outline: none; border-color: #3b82f6; }

  .input-hint { font-size: 0.75rem; opacity: 0.55; }

  /* Presets */
  .preset-connections {
    background: rgb(from var(--tertiaryColor) r g b / 0.4);
    padding: 0.875rem;
    border-radius: var(--radius-control, 8px);
  }

  .preset-label { font-size: 0.8rem; font-weight: 600; margin-bottom: 0.5rem; opacity: 0.65; }

  .preset-btn {
    width: 100%;
    padding: 0.55rem 0.75rem;
    margin-bottom: 0.35rem;
    background: var(--primaryColor);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.1);
    border-radius: var(--radius-control, 6px);
    color: var(--fontColor);
    cursor: pointer;
    text-align: left;
    font-size: 0.83rem;
    transition: border-color 0.15s, background 0.15s;
  }
  .preset-btn:last-child { margin-bottom: 0; }
  .preset-btn:hover { border-color: #3b82f6; background: rgba(59, 130, 246, 0.07); }

  /* Footer */
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid var(--tertiaryColor);
    flex-shrink: 0;
  }

  .btn {
    padding: 0.6rem 1.4rem;
    border-radius: var(--radius-control, 8px);
    border: none;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    transition: all 0.15s;
    font-size: 0.875rem;
  }

  .btn-primary { background: #3b82f6; color: white; }
  .btn-primary:hover:not(:disabled) { background: #2563eb; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-secondary {
    background: rgb(from var(--tertiaryColor) r g b / 0.7);
    color: var(--fontColor);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
  }
  .btn-secondary:hover { opacity: 0.8; }

  /* Mobile */
  @media (max-width: 540px) {
    .modal-backdrop { align-items: flex-end; padding: 0; }
    .modal-container { border-radius: 16px 16px 0 0; max-height: 95vh; max-width: 100%; }
    .connection-tabs { flex-direction: column; }
    .tab-btn { border-bottom: none; border-left: 3px solid transparent; justify-content: flex-start; }
    .tab-btn.active { border-left-color: #3b82f6; }
    .baud-btn { font-size: 0.73rem; padding: 0.28rem 0.55rem; }
  }
</style>
