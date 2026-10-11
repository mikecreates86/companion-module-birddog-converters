// Keeps a decoder healthy when its NDI feed goes away and comes back
// (for example when the sending app is closed and reopened), and can optionally
// restart the unit's video on a schedule. Everything here is off unless enabled.
export class SourceRecovery {
	constructor({
		enabled = false,
		restartOnReturn = false,
		restartHours = 0,
		retryMs = 30000,
		settleMs = 5000,
		minRestartGapMs = 60000,
		actions,
		isConnected,
		log = () => {},
	}) {
		this.enabled = enabled
		this.restartOnReturn = restartOnReturn
		this.restartHours = restartHours
		this.retryMs = retryMs
		this.settleMs = settleMs
		this.minRestartGapMs = minRestartGapMs
		this.actions = actions
		this.isConnected = isConnected
		this.log = log
		this.wasDown = false
		this.lastRestart = -Infinity
	}

	start() {
		if (this.restartHours > 0) {
			this.scheduleTimer = setInterval(
				() => {
					this.log('info', `Scheduled restart of video (every ${this.restartHours} hours)`)
					this.restart()
				},
				this.restartHours * 3600 * 1000,
			)
		}
	}

	stop() {
		for (const name of ['scheduleTimer', 'retryTimer', 'settleTimer']) {
			if (this[name]) {
				clearInterval(this[name])
				clearTimeout(this[name])
				delete this[name]
			}
		}
	}

	restart() {
		const now = Date.now()
		if (now - this.lastRestart < this.minRestartGapMs) {
			this.log('debug', 'Skipping video restart: one happened less than a minute ago')
			return
		}
		this.lastRestart = now
		this.actions.restart()
	}

	// Call whenever the unit reports its source status
	onStatus(status) {
		if (!this.enabled) return
		if (status !== 'Connected') {
			this.wasDown = true
			if (this.settleTimer) {
				clearTimeout(this.settleTimer)
				delete this.settleTimer
			}
			if (!this.retryTimer) {
				this.log(
					'info',
					`Feed is not connected (${status}). Will keep trying to reconnect every ${this.retryMs / 1000}s`,
				)
				this.retryTimer = setInterval(() => {
					this.log('info', 'Feed still not connected, refreshing source list and re-selecting the source')
					this.actions.refresh()
					this.actions.reselect()
				}, this.retryMs)
			}
			return
		}

		if (this.retryTimer) {
			clearInterval(this.retryTimer)
			delete this.retryTimer
		}
		if (!this.wasDown) return
		this.wasDown = false
		if (this.settleTimer) clearTimeout(this.settleTimer)
		this.settleTimer = setTimeout(() => {
			delete this.settleTimer
			if (!this.isConnected()) return // dropped again, the next return will handle it
			this.log(
				'info',
				'Feed came back, re-selecting the source' + (this.restartOnReturn ? ' and restarting video' : ''),
			)
			this.actions.reselect()
			if (this.restartOnReturn) this.restart()
		}, this.settleMs)
	}
}
