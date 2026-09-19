<script lang="ts">
  import { onMount } from 'svelte';
  import {
    darkModeStore,
    primaryColorStore,
    secondaryColorStore,
    tertiaryColorStore
  } from '../stores/customizationStore';

  interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
  }

  interface Props {
    isOpen?: boolean;
    onClose: () => void;
    onSelectPort: (port: string) => void;
  }

  let { isOpen = false, onClose, onSelectPort }: Props = $props();

  let ports: SerialPortInfo[] = $state([]);
  let loading = $state(true);
  let selectedPortPath: string | null = $state(null);

  let darkMode = $derived($darkModeStore);
  let primaryColor = $derived($primaryColorStore);
  let secondaryColor = $derived($secondaryColorStore);
  let tertiaryColor = $derived($tertiaryColorStore);
  let fontColor = $derived(darkMode ? '#ffffff' : '#000000');

  async function loadPorts() {
    loading = true;
    try {
      const response = await fetch('/api/mavlink/list_ports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        ports = await response.json();
      } else {
        console.error('Failed to load ports:', response.status);
      }
    } catch (error) {
      console.error('Error loading ports:', error);
    } finally {
      loading = false;
    }
  }

  function handleSelectPort(portPath: string) {
    selectedPortPath = portPath;
  }

  async function handleConnect() {
    if (!selectedPortPath) return;
    try {
      const response = await fetch('/api/mavlink/select_port', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'port': selectedPortPath }
      });
      if (response.ok) {
        onSelectPort(selectedPortPath);
        onClose();
      }
    } catch (error) {
      console.error('Error selecting port:', error);
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleBackdropKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  onMount(() => { if (isOpen) loadPorts(); });

  $effect(() => { if (isOpen) loadPorts(); });
</script>

{#if isOpen}
<div
  class="modal-backdrop"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="button"
  tabindex="0"
  aria-label="Close modal"
>
  <div
    class="modal-content"
    style="--primaryColor: {primaryColor}; --secondaryColor: {secondaryColor}; --tertiaryColor: {tertiaryColor}; --fontColor: {fontColor};"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div class="modal-header">
      <h2 id="modal-title" class="modal-title">Select Serial Port</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <div class="modal-body">
      {#if loading}
        <div class="loading">
          <i class="fas fa-spinner fa-spin"></i> Scanning for ports...
        </div>
      {:else if ports.length === 0}
        <div class="no-ports">
          <i class="fas fa-exclamation-triangle"></i>
          <p>No serial ports detected</p>
          <p class="hint">Please connect your USB device and try again</p>
          <button class="refresh-btn" onclick={loadPorts}>
            <i class="fas fa-rotate"></i> Refresh
          </button>
        </div>
      {:else}
        <div class="ports-list">
          {#each ports as port (port.path)}
            <button
              class="port-item {selectedPortPath === port.path ? 'selected' : ''}"
              onclick={() => handleSelectPort(port.path)}
            >
              <div class="port-icon"><i class="fas fa-usb"></i></div>
              <div class="port-info">
                <div class="port-path">{port.path}</div>
                {#if port.manufacturer}
                  <div class="port-detail">{port.manufacturer}</div>
                {/if}
                {#if port.serialNumber}
                  <div class="port-detail">S/N: {port.serialNumber}</div>
                {/if}
              </div>
              {#if selectedPortPath === port.path}
                <i class="fas fa-check-circle selected-icon"></i>
              {/if}
            </button>
          {/each}
        </div>
        <div class="actions">
          <button class="btn btn-secondary" onclick={loadPorts}>
            <i class="fas fa-rotate"></i> Refresh
          </button>
          <button
            class="btn btn-primary"
            onclick={handleConnect}
            disabled={!selectedPortPath}
          >
            <i class="fas fa-plug"></i> Connect
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background-color: var(--primaryColor);
    color: var(--fontColor);
    border: 2px solid var(--secondaryColor);
    border-radius: var(--radius-control, 12px);
    min-width: 400px;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.12);
  }

  .modal-title {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--fontColor);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--fontColor);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius-control, 6px);
    opacity: 0.7;
    transition: opacity 0.2s, background-color 0.2s;
  }

  .close-btn:hover {
    opacity: 1;
    background-color: rgb(from var(--fontColor) r g b / 0.08);
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    font-size: 1rem;
    opacity: 0.7;
  }

  .no-ports {
    text-align: center;
    padding: 2rem;
    color: var(--fontColor);
  }

  .no-ports i {
    font-size: 2.5rem;
    color: #f59e0b;
    margin-bottom: 1rem;
    display: block;
  }

  .no-ports p {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .hint {
    margin-top: 0.5rem !important;
    font-size: 0.85rem !important;
    font-weight: 400 !important;
    opacity: 0.7;
  }

  .ports-list {
    max-height: 360px;
    overflow-y: auto;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .port-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background-color: rgb(from var(--tertiaryColor) r g b / 0.5);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.08);
    border-radius: var(--radius-control, 8px);
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    text-align: left;
    color: var(--fontColor);
  }

  .port-item:hover {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.8);
    border-color: #3b82f6;
  }

  .port-item.selected {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
    border-color: #10b981;
  }

  .port-icon {
    font-size: 1.75rem;
    color: #3b82f6;
    flex-shrink: 0;
  }

  .port-info {
    flex: 1;
    min-width: 0;
  }

  .port-path {
    font-weight: 600;
    font-size: 1rem;
    margin-bottom: 0.2rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .port-detail {
    font-size: 0.8rem;
    opacity: 0.65;
  }

  .selected-icon {
    font-size: 1.25rem;
    color: #10b981;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid rgb(from var(--fontColor) r g b / 0.12);
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 1.2rem;
    font-size: 0.85rem;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-control, 6px);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: #10b981;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #059669;
  }

  .btn-secondary {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
    color: var(--fontColor);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
  }

  /* Refresh button in the empty state */
  .refresh-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 1rem;
    padding: 0.6rem 1.2rem;
    font-size: 0.85rem;
    font-weight: 600;
    background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
    color: var(--fontColor);
    border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
    border-radius: var(--radius-control, 6px);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .refresh-btn:hover {
    background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
  }

  @media (max-width: 640px) {
    .modal-content {
      min-width: unset;
      width: 90vw;
      max-height: 90vh;
    }
  }
</style>
