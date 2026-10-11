import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { SourceRecovery } from '../recovery.js'

function setup(opts = {}) {
	mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
	const calls = []
	let connected = true
	const r = new SourceRecovery({
		enabled: true,
		actions: {
			refresh: () => calls.push('refresh'),
			reselect: () => calls.push('reselect'),
			restart: () => calls.push('restart'),
		},
		isConnected: () => connected,
		...opts,
	})
	return { r, calls, setConnected: (v) => (connected = v) }
}

test('does nothing when disabled', () => {
	const { r, calls } = setup({ enabled: false })
	r.onStatus('No Source')
	mock.timers.tick(120000)
	assert.deepEqual(calls, [])
	r.stop()
	mock.timers.reset()
})

test('retries every 30s while down, stops when back, reselects once after settling', () => {
	const { r, calls, setConnected } = setup()
	setConnected(false)
	r.onStatus('No Source')
	mock.timers.tick(60000)
	assert.deepEqual(calls, ['refresh', 'reselect', 'refresh', 'reselect'])
	setConnected(true)
	r.onStatus('Connected')
	mock.timers.tick(5000)
	assert.deepEqual(calls.slice(4), ['reselect'])
	mock.timers.tick(120000)
	assert.equal(calls.length, 5) // no more retries
	r.stop()
	mock.timers.reset()
})

test('restarts video on return only when asked, and not twice within a minute', () => {
	const { r, calls, setConnected } = setup({ restartOnReturn: true })
	r.onStatus('No Source')
	setConnected(true)
	r.onStatus('Connected')
	mock.timers.tick(5000)
	assert.ok(calls.includes('restart'))
	const n = calls.filter((c) => c === 'restart').length
	r.onStatus('No Source')
	r.onStatus('Connected')
	mock.timers.tick(5000)
	assert.equal(calls.filter((c) => c === 'restart').length, n)
	r.stop()
	mock.timers.reset()
})

test('does not act if the feed drops again during the settle delay', () => {
	const { r, calls, setConnected } = setup({ restartOnReturn: true })
	r.onStatus('No Source')
	r.onStatus('Connected')
	setConnected(false)
	r.onStatus('No Source')
	mock.timers.tick(5000)
	assert.ok(!calls.includes('restart'))
	r.stop()
	mock.timers.reset()
})

test('a normal start (already connected) triggers nothing', () => {
	const { r, calls } = setup({ restartOnReturn: true })
	r.onStatus('Connected')
	mock.timers.tick(60000)
	assert.deepEqual(calls, [])
	r.stop()
	mock.timers.reset()
})

test('scheduled restart runs every N hours', () => {
	const { r, calls } = setup({ restartHours: 2 })
	r.start()
	mock.timers.tick(2 * 3600 * 1000)
	assert.deepEqual(calls, ['restart'])
	mock.timers.tick(2 * 3600 * 1000)
	assert.deepEqual(calls, ['restart', 'restart'])
	r.stop()
	mock.timers.reset()
})
