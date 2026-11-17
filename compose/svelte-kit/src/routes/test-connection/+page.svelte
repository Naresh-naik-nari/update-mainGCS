<script lang="ts">
  import ConnectionModal from '../../components/ConnectionModal.svelte';
  import { onMount } from 'svelte';

  interface ConnectionStatus {
    state: string;
    type?: string;
    online: boolean;
    lastPacketAt: number;
    alive: boolean;
  }

  interface ConnectionConfig {
    type: 'serial' | 'tcp' | 'udp';
    port?: string;
    baudRate?: number;
    host?: string;
    portNumber?: number;
    bindPort?: number;
  }

  let showConnectionModal = $state(false);
  let connectionStatus = $state<ConnectionStatus | null>(null);
  let lastConfig = $state<ConnectionConfig | null>(null);
  let statusInterval: ReturnType<typeof setInterval> | null = null;
  
  onMount(() => {
    loadConnectionStatus();
    statusInterval = setInterval(loadConnectionStatus, 2000);
    
    return () => {
      if (statusInterval) clearInterval(statusInterval);
    };
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
  
  function handleConnect(config: ConnectionConfig) {
    console.log('Connected with config:', config);
    lastConfig = config;
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
  
  function formatTimestamp(ts: number) {
    if (!ts) return 'Never';
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
</script>

<svelte:head>
  <title>Connection Test - Sidak GCS</title>
</svelte:head>

<div class="test-page">
  <div class="header">
    <h1>Connection Modal Test Page</h1>
    <p>Test the new connection modal with Serial, TCP, and UDP support</p>
  </div>
  
  <div class="content">
    <!-- Connection Status Card -->
    <div class="card status-card">
      <h2>Connection Status</h2>
      {#if connectionStatus}
        <div class="status-grid">
          <div class="status-item">
            <span class="label">State:</span>
            <div class="status-value">
              <span 
                class="status-dot" 
                style="background: {getStatusColor(connectionStatus.state)}"
              ></span>
              <span class="text">{connectionStatus.state}</span>
            </div>
          </div>
          
          <div class="status-item">
            <span class="label">Transport:</span>
            <span class="value">{connectionStatus.type || 'None'}</span>
          </div>
          
          <div class="status-item">
            <span class="label">Online:</span>
            <span class="value">{connectionStatus.online ? 'Yes' : 'No'}</span>
          </div>
          
          <div class="status-item">
            <span class="label">Last Packet:</span>
            <span class="value">{formatTimestamp(connectionStatus.lastPacketAt)}</span>
          </div>
          
          <div class="status-item">
            <span class="label">Alive:</span>
            <span class="value">{connectionStatus.alive ? 'Yes' : 'No'}</span>
          </div>
        </div>
      {:else}
        <p class="loading-text">Loading status...</p>
      {/if}
    </div>
    
    <!-- Last Connection Card -->
    {#if lastConfig}
      <div class="card config-card">
        <h2>Last Connection Config</h2>
        <pre>{JSON.stringify(lastConfig, null, 2)}</pre>
      </div>
    {/if}
    
    <!-- Connection Button -->
    <div class="card action-card">
      <h2>Actions</h2>
      <div class="buttons">
        <button 
          class="connect-btn primary" 
          onclick={() => showConnectionModal = true}
        >
          <i class="fas fa-plug"></i>
          {connectionStatus?.state === 'connected' ? 'Reconnect' : 'Connect'}
        </button>
        
        <button 
          class="connect-btn secondary" 
          onclick={loadConnectionStatus}
        >
          <i class="fas fa-sync-alt"></i>
          Refresh Status
        </button>
      </div>
    </div>
    
    <!-- Instructions Card -->
    <div class="card info-card">
      <h2>Testing Instructions</h2>
      <ol>
        <li>Click the "Connect" button above</li>
        <li>Choose your connection type (Serial, TCP, or UDP)</li>
        <li>For Serial: Select a port from the list or click refresh</li>
        <li>For TCP/UDP: Enter connection details or use presets</li>
        <li>Click "Connect" in the modal</li>
        <li>Watch the status update above</li>
      </ol>
      
      <h3>Quick Test Configurations</h3>
      <ul>
        <li><strong>Serial:</strong> Connect USB cable to flight controller</li>
        <li><strong>TCP SITL:</strong> Use 127.0.0.1:5760 (if running SITL)</li>
        <li><strong>UDP:</strong> Use the "Your FC" preset (192.168.0.7:8234)</li>
      </ul>
    </div>
  </div>
</div>

<ConnectionModal
  isOpen={showConnectionModal}
  onClose={() => showConnectionModal = false}
  onConnect={handleConnect}
/>

<style>
  .test-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: system-ui, -apple-system, sans-serif;
  }
  
  .header {
    margin-bottom: 2rem;
    text-align: center;
  }
  
  .header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
    color: var(--fontColor, #000);
  }
  
  .header p {
    font-size: 1.1rem;
    opacity: 0.7;
    color: var(--fontColor, #000);
  }
  
  .content {
    display: grid;
    gap: 1.5rem;
  }
  
  .card {
    background: var(--primaryColor, #fff);
    border: 1px solid var(--tertiaryColor, #e5e7eb);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .card h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: var(--fontColor, #000);
  }
  
  .card h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    color: var(--fontColor, #000);
  }
  
  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .status-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .status-item .label {
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.7;
    color: var(--fontColor, #000);
  }
  
  .status-item .value {
    font-size: 1rem;
    font-weight: 500;
    color: var(--fontColor, #000);
  }
  
  .status-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .status-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .status-value .text {
    font-size: 1rem;
    font-weight: 500;
    text-transform: capitalize;
    color: var(--fontColor, #000);
  }
  
  .loading-text {
    opacity: 0.7;
    font-style: italic;
    color: var(--fontColor, #000);
  }
  
  .config-card pre {
    background: var(--secondaryColor, #f9fafb);
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    color: var(--fontColor, #000);
  }
  
  .buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  
  .connect-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .connect-btn.primary {
    background: #3b82f6;
    color: white;
  }
  
  .connect-btn.primary:hover {
    background: #2563eb;
  }
  
  .connect-btn.secondary {
    background: var(--tertiaryColor, #e5e7eb);
    color: var(--fontColor, #000);
  }
  
  .connect-btn.secondary:hover {
    opacity: 0.8;
  }
  
  .info-card ol,
  .info-card ul {
    margin-left: 1.5rem;
    line-height: 1.8;
    color: var(--fontColor, #000);
  }
  
  .info-card li {
    margin-bottom: 0.5rem;
  }
  
  @media (max-width: 768px) {
    .test-page {
      padding: 1rem;
    }
    
    .header h1 {
      font-size: 1.5rem;
    }
    
    .status-grid {
      grid-template-columns: 1fr;
    }
    
    .buttons {
      flex-direction: column;
    }
    
    .connect-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
