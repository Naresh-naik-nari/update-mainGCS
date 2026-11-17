<script lang="ts">
	import Select from './Select.svelte';
	import { onMount, onDestroy } from 'svelte';

	interface ConnectionSettings {
		transportType: 'serial' | 'tcp' | 'udp';
		serialPath: string;
		serialBaud: number;
		serialAutoDetect: boolean;
		tcpHost: string;
		tcpPort: number;
		udpMode: 'client' | 'server';
		udpHost: string;
		udpPort: number;
		udpBindHost: string;
	}

	interface SerialPort {
		path: string;
		manufacturer?: string;
		serialNumber?: string;
	}

	interface ConnectionStatus {
		type: string | null;
		state: 'disconnected' | 'connecting' | 'connected' | 'error';
		online: boolean;
		lastPacketAt: number;
		alive: boolean;
	}

	let settings: ConnectionSettings | null = $state(null);
	let status: ConnectionStatus | null = $state(null);
	let availablePorts: SerialPort[] = $state([]);
	let loading = $state(true);
	let saving = $state(false);
	let detecting = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let statusInterval: ReturnType<typeof setInterval> | null = null;
	
	// String representation for Select component
	let serialBaudStr = $state('115200');

	const COMMON_BAUD_RATES = [
		{ value: '9600', label: '9600' },
		{ value: '19200', label: '19200' },
		{ value: '38400', label: '38400' },
		{ value: '57600', label: '57600' },
		{ value: '115200', label: '115200' },
		{ value: '230400', label: '230400' },
		{ value: '460800', label: '460800' },
		{ value: '921600', label: '921600' }
	];

	const TRANSPORT_TYPES = [
		{ value: 'serial', label: 'Serial (USB/UART)' },
		{ value: 'tcp', label: 'TCP (Network/SITL)' },
		{ value: 'udp', label: 'UDP (Telemetry Radio)' }
	];

	const UDP_MODES = [
		{ value: 'server', label: 'Server (Listen)' },
		{ value: 'client', label: 'Client (Connect)' }
	];

	onMount(async () => {
		await loadSettings();
		await loadStatus();
		await loadSerialPorts();

		// Poll status every 2 seconds
		statusInterval = setInterval(loadStatus, 2000);
	});

	onDestroy(() => {
		if (statusInterval) clearInterval(statusInterval);
	});

	async function loadSettings() {
		try {
			const response = await fetch('/api/mavlink/connection');
			if (!response.ok) throw new Error('Failed to load settings');
			const data = await response.json();
			settings = data.settings;
			serialBaudStr = String(data.settings.serialBaud);
			status = data.status;
			loading = false;
		} catch (error) {
			errorMessage = (error as Error).message;
			loading = false;
		}
	}

	async function loadStatus() {
		try {
			const response = await fetch('/api/mavlink/connection/status');
			if (!response.ok) return;
			const data = await response.json();
			status = data;
		} catch {
			// Silent fail for status polling
		}
	}

	async function loadSerialPorts() {
		try {
			const response = await fetch('/api/mavlink/connection/ports');
			if (!response.ok) return;
			const data = await response.json();
			availablePorts = data.ports;
		} catch {
			// Silent fail for port list
		}
	}

	async function detectSerialPort() {
		detecting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const response = await fetch('/api/mavlink/connection/ports/detect', {
				method: 'POST'
			});
			const data = await response.json();

			if (data.success && data.detected && settings) {
				settings.serialPath = data.detected.path;
				serialBaudStr = String(data.detected.baudRate);
				successMessage = data.message;
				await loadSerialPorts(); // Refresh port list
			} else {
				errorMessage = data.message || 'No MAVLink port detected';
			}
		} catch (error) {
			errorMessage = (error as Error).message;
		} finally {
			detecting = false;
		}
	}

	async function saveSettings(reconnect: boolean = false) {
		if (!settings) return;

		// Convert string baud back to number
		settings.serialBaud = Number(serialBaudStr);

		saving = true;
		errorMessage = '';
		successMessage = '';

		try {
			const response = await fetch('/api/mavlink/connection', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ settings, reconnect })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save settings');
			}

			const data = await response.json();
			settings = data.settings;
			serialBaudStr = String(data.settings.serialBaud);
			status = data.status;
			successMessage = data.message;
		} catch (error) {
			errorMessage = (error as Error).message;
		} finally {
			saving = false;
		}
	}

	async function reconnect() {
		errorMessage = '';
		successMessage = '';

		try {
			const response = await fetch('/api/mavlink/connection', {
				method: 'DELETE'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to reconnect');
			}

			successMessage = 'Reconnection triggered';
			await loadStatus();
		} catch (error) {
			errorMessage = (error as Error).message;
		}
	}

	function getStateColor(state: string): string {
		switch (state) {
			case 'connected':
				return '#22c55e'; // green
			case 'connecting':
				return '#eab308'; // yellow
			case 'error':
				return '#ef4444'; // red
			default:
				return '#6b7280'; // gray
		}
	}

	function formatTimeSince(timestamp: number): string {
		if (!timestamp) return 'never';
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		return `${hours}h ago`;
	}

	let portOptions = $derived(
		availablePorts.map((p) => ({
			value: p.path,
			label: p.manufacturer
				? `${p.path} (${p.manufacturer})`
				: p.path
		}))
	);
</script>

<div class="connection-settings">
	<div class="header">
		<h2>MAVLink Connection</h2>
		{#if status}
			<div class="status-indicator">
				<div class="status-dot" style="background-color: {getStateColor(status.state)}"></div>
				<span class="status-text">
					{status.state}
					{#if status.online && status.lastPacketAt}
						· {formatTimeSince(status.lastPacketAt)}
					{/if}
				</span>
			</div>
		{/if}
	</div>

	{#if loading}
		<div class="loading">Loading connection settings...</div>
	{:else if settings}
		<div class="settings-form">
			<!-- Transport Type Selection -->
			<div class="form-group">
				<label for="transport-type">Transport Type</label>
				<Select
					id="transport-type"
					bind:value={settings.transportType}
					options={TRANSPORT_TYPES}
				/>
			</div>

			<!-- Serial Settings -->
			{#if settings.transportType === 'serial'}
				<div class="transport-section">
					<h3>Serial Connection</h3>

					<div class="form-group">
						<label class="checkbox-label">
							<input
								type="checkbox"
								bind:checked={settings.serialAutoDetect}
							/>
							<span>Auto-detect MAVLink port</span>
						</label>
					</div>

					{#if !settings.serialAutoDetect}
						<div class="form-group">
							<label for="serial-path">Serial Port</label>
							<div class="input-with-button">
								<Select
									id="serial-path"
									bind:value={settings.serialPath}
									options={portOptions}
									placeholder="Select or enter port path"
									searchable={true}
								/>
								<button
									type="button"
									class="btn-icon"
									onclick={detectSerialPort}
									disabled={detecting}
									title="Detect MAVLink port"
								>
									<i class="fas fa-search"></i>
								</button>
							</div>
						</div>

						<div class="form-group">
							<label for="serial-baud">Baud Rate</label>
							<Select
								id="serial-baud"
								bind:value={serialBaudStr}
								options={COMMON_BAUD_RATES}
							/>
						</div>
					{/if}
				</div>
			{/if}

			<!-- TCP Settings -->
			{#if settings.transportType === 'tcp'}
				<div class="transport-section">
					<h3>TCP Connection</h3>

					<div class="form-group">
						<label for="tcp-host">Host</label>
						<input
							id="tcp-host"
							type="text"
							bind:value={settings.tcpHost}
							placeholder="localhost or sitl"
							class="text-input"
						/>
					</div>

					<div class="form-group">
						<label for="tcp-port">Port</label>
						<input
							id="tcp-port"
							type="number"
							bind:value={settings.tcpPort}
							placeholder="5760"
							min="1"
							max="65535"
							class="text-input"
						/>
					</div>
				</div>
			{/if}

			<!-- UDP Settings -->
			{#if settings.transportType === 'udp'}
				<div class="transport-section">
					<h3>UDP Connection</h3>

					<div class="form-group">
						<label for="udp-mode">Mode</label>
						<Select
							id="udp-mode"
							bind:value={settings.udpMode}
							options={UDP_MODES}
						/>
					</div>

					<div class="form-group">
						<label for="udp-port">Port</label>
						<input
							id="udp-port"
							type="number"
							bind:value={settings.udpPort}
							placeholder="14550"
							min="1"
							max="65535"
							class="text-input"
						/>
					</div>

					{#if settings.udpMode === 'client'}
						<div class="form-group">
							<label for="udp-host">Remote Host</label>
							<input
								id="udp-host"
								type="text"
								bind:value={settings.udpHost}
								placeholder="127.0.0.1"
								class="text-input"
							/>
						</div>
					{:else}
						<div class="form-group">
							<label for="udp-bind-host">Bind Address</label>
							<input
								id="udp-bind-host"
								type="text"
								bind:value={settings.udpBindHost}
								placeholder="0.0.0.0"
								class="text-input"
							/>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Messages -->
			{#if errorMessage}
				<div class="message error">
					<i class="fas fa-exclamation-circle"></i>
					{errorMessage}
				</div>
			{/if}

			{#if successMessage}
				<div class="message success">
					<i class="fas fa-check-circle"></i>
					{successMessage}
				</div>
			{/if}

			<!-- Actions -->
			<div class="actions">
				<button
					type="button"
					class="btn btn-primary"
					onclick={() => saveSettings(false)}
					disabled={saving}
				>
					{#if saving}
						<i class="fas fa-spinner fa-spin"></i>
						Saving...
					{:else}
						<i class="fas fa-save"></i>
						Save Settings
					{/if}
				</button>

				<button
					type="button"
					class="btn btn-secondary"
					onclick={() => saveSettings(true)}
					disabled={saving}
				>
					<i class="fas fa-plug"></i>
					Save & Reconnect
				</button>

				<button
					type="button"
					class="btn btn-secondary"
					onclick={reconnect}
					disabled={status?.state === 'connecting'}
				>
					<i class="fas fa-rotate"></i>
					Reconnect
				</button>
			</div>
		</div>
	{:else}
		<div class="error">Failed to load connection settings</div>
	{/if}
</div>

<style>
	.connection-settings {
		padding: 1.5rem;
		background-color: var(--primaryColor);
		border-radius: var(--radius-control);
		border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgb(from var(--fontColor) r g b / 0.12);
	}

	h2 {
		margin: 0;
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--fontColor);
	}

	h3 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--fontColor);
		opacity: 0.9;
	}

	.status-indicator {
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
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.status-text {
		font-size: 0.85rem;
		color: var(--fontColor);
		opacity: 0.7;
		text-transform: capitalize;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.transport-section {
		padding: 1rem;
		background-color: rgb(from var(--tertiaryColor) r g b / 0.5);
		border-radius: var(--radius-control);
		border: 1px solid rgb(from var(--fontColor) r g b / 0.08);
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group + .form-group {
		margin-top: 1rem;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--fontColor);
		opacity: 0.85;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-weight: 500;
	}

	.checkbox-label input[type='checkbox'] {
		appearance: none;
		width: 1.1rem;
		height: 1.1rem;
		border: 2px solid rgb(from var(--fontColor) r g b / 0.3);
		border-radius: 0.25rem;
		background-color: var(--tertiaryColor);
		cursor: pointer;
		position: relative;
		transition: all 0.2s ease;
	}

	.checkbox-label input[type='checkbox']:checked {
		background-color: #3b82f6;
		border-color: #3b82f6;
	}

	.checkbox-label input[type='checkbox']:checked::after {
		content: '✓';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: white;
		font-size: 0.8rem;
		font-weight: bold;
	}

	.text-input {
		appearance: none;
		width: 100%;
		padding: 0.55rem 0.8rem;
		font-size: 0.85rem;
		color: var(--fontColor);
		background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
		border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
		border-radius: var(--radius-control);
		outline: none;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.text-input:focus {
		border-color: #f5c518;
		background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
		box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.18);
	}

	.text-input::placeholder {
		color: rgb(from var(--fontColor) r g b / 0.35);
	}

	.input-with-button {
		display: flex;
		gap: 0.5rem;
	}

	.btn-icon {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
		border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
		border-radius: var(--radius-control);
		color: var(--fontColor);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-icon:hover:not(:disabled) {
		background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
		border-color: rgb(from var(--fontColor) r g b / 0.22);
	}

	.btn-icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.message {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-control);
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.message.error {
		background-color: rgba(239, 68, 68, 0.15);
		color: #fca5a5;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.message.success {
		background-color: rgba(34, 197, 94, 0.15);
		color: #86efac;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		padding-top: 1rem;
		border-top: 1px solid rgb(from var(--fontColor) r g b / 0.12);
		flex-wrap: wrap;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.65rem 1.2rem;
		font-size: 0.85rem;
		font-weight: 600;
		border: none;
		border-radius: var(--radius-control);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background-color: #3b82f6;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: #2563eb;
	}

	.btn-secondary {
		background-color: rgb(from var(--tertiaryColor) r g b / 0.7);
		color: var(--fontColor);
		border: 1px solid rgb(from var(--fontColor) r g b / 0.12);
	}

	.btn-secondary:hover:not(:disabled) {
		background-color: rgb(from var(--tertiaryColor) r g b / 0.9);
		border-color: rgb(from var(--fontColor) r g b / 0.22);
	}

	.loading,
	.error {
		padding: 2rem;
		text-align: center;
		color: var(--fontColor);
		opacity: 0.7;
	}
</style>
