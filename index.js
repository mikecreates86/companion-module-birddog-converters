import { InstanceBase, runEntrypoint } from '@companion-module/base'
import { getActions } from './actions.js'
import { getPresets } from './presets.js'
import { getVariables } from './variables.js'
import { getFeedbacks } from './feedbacks.js'
import { upgradeScripts } from './upgrades.js'
import { models, getStaticMode } from './models.js'

import fetch from 'node-fetch'
import WebSocket from 'ws'

class BirdDogInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config
		this.legacy = null
		this.device = {}
		this.destroyed = false
		this.updateStatus('connecting')

		this.stopTimers()
		this.closeWebsocket()

		if (this.config?.host) {
			this.checkConnection()
		} else {
			this.updateStatus('bad_config', 'No host configured')
		}
	}

	async destroy() {
		this.destroyed = true
		this.device = {}
		this.stopTimers()
		this.closeWebsocket()
	}

	async configUpdated(config) {
		await this.init(config)
	}

	stopTimers() {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer)
			delete this.retryTimer
		}
		if (this.websocketPoll) {
			clearTimeout(this.websocketPoll)
			delete this.websocketPoll
		}
	}

	// Detach and close the socket so a stale socket can never schedule reconnects
	closeWebsocket() {
		if (this.ws !== undefined) {
			const ws = this.ws
			delete this.ws
			ws.removeAllListeners()
			ws.on('error', () => {})
			try {
				ws.terminate()
			} catch (e) {
				//ignore
			}
		}
	}

	// Only ever one pending reconnect timer, with capped backoff
	scheduleWebsocketReconnect() {
		if (this.destroyed || this.websocketPoll) return
		const delay = Math.min(5000 * 2 ** (this.wsFailures || 0), 60000)
		this.wsFailures = (this.wsFailures || 0) + 1
		this.websocketPoll = setTimeout(() => {
			delete this.websocketPoll
			this.initWebsocket()
		}, delay)
	}

	getConfigFields() {
		return [
			{
				type: 'textinput',
				label: 'Device IP or Hostname',
				id: 'host',
				width: 6,
				required: true,
			},
		]
	}

	scheduleConnectionRetry() {
		if (this.destroyed || this.retryTimer) return
		this.retryTimer = setTimeout(() => {
			delete this.retryTimer
			this.checkConnection()
		}, 10000)
	}

	fetchWithTimeout(url, options = {}, timeout = 5000) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeout)
		return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
	}

	checkConnection() {
		this.fetchWithTimeout(`http://${this.config.host}:8080/about`)
			.then((res) => {
				if (res.status == 200) {
					return res.json()
				}
			})
			.then((data) => {
				if (this.destroyed) return
				if (data?.HostName) {
					this.device.about = data
					this.log('info', `Connected to ${data.HostName}`)
					this.updateStatus('ok')
					this.openConnection()
				} else if (data?.Version === '1.0') {
					this.legacy = true
					this.log('info', `Connected to ${data.MyHostName}`)
					this.updateStatus('ok')
					this.openConnection()
				} else {
					this.updateStatus('connection_failure', 'Unexpected response from device')
					this.scheduleConnectionRetry()
				}
			})
			.catch((error) => {
				if (this.destroyed) return
				this.updateStatus('connection_failure', 'Unable to connect to BirdDog converter')
				this.log('debug', `Connection check failed: ${error}`)
				this.scheduleConnectionRetry()
			})
	}

	openConnection() {
		//Gather device data
		this.sendCommand('about', 'GET')
		this.sendCommand('List', 'GET')
		this.sendCommand('connectTo', 'GET')

		//Initialize Companion components
		this.initVariables()
		this.initFeedbacks()
		this.initActions()
		this.initPresets()

		//Open Websocket
		this.initWebsocket()

		//Model Specific Requests
		if (!this.legacy) {
			let device = this.device.about.Format
			if (models.operationmode.available.find((converter) => converter == device)) {
				this.sendCommand('operationmode', 'GET')
			} else {
				let mode = getStaticMode(device)
				if (!mode) {
					this.log('warn', `Unrecognised device format "${device}", mode unknown`)
				}
				this.setVariableValues({ current_mode: mode ? mode : 'Unknown' })
			}
		} else {
			this.sendCommand('av-settings', 'GET')
		}
	}
	initVariables() {
		const variables = getVariables.bind(this)()
		this.setVariableDefinitions(variables)
	}

	initFeedbacks() {
		const feedbacks = getFeedbacks.bind(this)()
		this.setFeedbackDefinitions(feedbacks)
	}

	initPresets() {
		const presets = getPresets.bind(this)()
		this.setPresetDefinitions(presets)
	}

	initActions() {
		const actions = getActions.bind(this)()
		this.setActionDefinitions(actions)
	}

	sendCommand(cmd, type, params) {
		let url = `http://${this.config.host}:8080/${cmd}`
		let options = {
			method: type,
			headers: { 'Content-Type': 'application/json' },
		}
		if (type == 'PUT' || type == 'POST') {
			options.body = params != undefined ? JSON.stringify(params) : null
		}

		this.fetchWithTimeout(url, options)
			.then(async (res) => {
				if (res.status != 200) return
				if (cmd === 'operationmode') {
					return (await res.text()).trim()
				}
				return res.json()
			})
			.then((data) => {
				if (this.destroyed) return
				if (data?.success) {
					//ignore success messages that do not have data
				} else if (data?.success === false) {
					this.log('warn', `Command failed: ${data.error}`)
				} else if (data) {
					this.processData(cmd, data)
				}
			})
			.catch((error) => {
				this.log('debug', `Command ${cmd} failed: ${error}`)
			})
	}

	processData(cmd, data) {
		if (cmd.match('about')) {
			this.device.about = data
			if (this.legacy) {
				this.device.about.HostName = data.MyHostName
			}
			this.setVariableValues({
				device_name: data.HostName,
			})
		} else if (cmd.match('List')) {
			this.device.list = []
			for (let key of Object.keys(data)) {
				let name = key
				this.device.list.push({ id: name, label: name })
			}
			this.initActions()
			this.initFeedbacks()
			this.initPresets()
		} else if (cmd.match('connectTo')) {
			this.device.decodeSource = data.sourceName
			this.setVariableValues({
				decode_source: data.sourceName,
			})
			this.checkFeedbacks('decodeSourceName')
		} else if (cmd.match('operationmode')) {
			this.device.operationMode = data
			this.setVariableValues({
				current_mode: data,
			})
		}
		//LEGACY
		else if (cmd.match('av-settings')) {
			if (data.videoout) {
				this.device.operationMode = data.videoout == 'videooutd' ? 'Decode' : 'Encode'
				this.setVariableValues({
					current_mode: this.device.operationMode,
				})
			}
		}
	}

	initWebsocket() {
		if (this.destroyed) return
		this.closeWebsocket()

		const ws = new WebSocket(`ws://${this.config.host}:6790/`, { handshakeTimeout: 5000 })
		this.ws = ws

		ws.on('open', () => {
			this.log('debug', `WebSocket connection opened`)
			this.wsFailures = 0
			this.updateStatus('ok')
		})

		ws.on('close', (code) => {
			this.log('debug', `WebSocket Connection closed with code ${code}`)
			if (this.ws !== ws) return
			delete this.ws
			if (!this.destroyed) {
				this.updateStatus('connection_failure')
				this.scheduleWebsocketReconnect()
			}
		})

		ws.on('message', (message) => {
			let data
			try {
				data = JSON.parse(message.toString())
				this.processWebsocket(data)
			} catch (e) {
				this.log('debug', 'JSON Error:' + e)
			}
		})

		ws.on('error', (data) => {
			this.log('debug', `WebSocket error: ${data}`)
		})
	}

	processWebsocket(data) {
		let updates = {}
		for (const [key, value] of Object.entries(data)) {
			if (key === 'vid_str_name' && value && value != this.device.decodeSource) {
				this.device.decodeSource = value
				updates.decode_source = value
				this.checkFeedbacks('decodeSourceName')
			} else if (key === 'vid_disp' && value != this.device.videoFormat) {
				this.device.videoFormat = value
				updates.video_format = value
			} else if (key === 'src_stat' && value && value != this.device.sourceStatus) {
				this.device.sourceStatus = value
				updates.source_status = value
				this.checkFeedbacks('decodeSourceStatus')
			} else if (key === 'vid_res' && value && value != this.device.videoResolution) {
				this.device.videoResolution = value
				updates.video_resolution = value
			} else if (key === 'vid_fr' && value && value != this.device.videoFrameRate) {
				this.device.videoFrameRate = value
				updates.video_framerate = value
			}
			//LEGACY
			else if (key === 'cp2' && value && value != this.device.sourceStatus) {
				this.device.sourceStatus = value
				updates.source_status = value
				this.checkFeedbacks('decodeSourceStatus')
			}
		}

		if (!this.device.videoFormat || updates.video_resolution) {
			updates.video_format = `${this.device.videoResolution ? this.device.videoResolution : ''} ${
				this.device.videoFrameRate ? this.device.videoFrameRate : ''
			}`
			this.device.videoFormat = updates.video_format
		}
		this.setVariableValues(updates)
	}
}

runEntrypoint(BirdDogInstance, upgradeScripts)
