export const models = {
	operationmode: {
		available: ['Studio', 'Mini', '4KHDMI/SDI', 'QUAD'],
		static: {
			'Flex Encode': 'Encode',
			'Flex Decode': 'Decode',
			'WP Encode': 'Encode',
			'WP Decode': 'Decode',
			PLAY: 'Decode',
			'KILOVIEW-N5 (Program)': 'Decode',
		},
	},
}

// Match the device Format loosely (case/spacing/prefix) so variants like "BirdDog Play" resolve
export function getStaticMode(format) {
	if (!format) return undefined
	const exact = models.operationmode.static[format]
	if (exact) return exact
	const f = String(format).toLowerCase()
	if (f.includes('decode')) return 'Decode'
	if (f.includes('encode')) return 'Encode'
	if (/\bplay\b/.test(f) || f.startsWith('kiloview-n5')) return 'Decode'
	return undefined
}
