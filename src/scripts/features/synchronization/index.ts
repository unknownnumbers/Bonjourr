import { retrieveGist, sendGist, findGistId, isGistTokenValid } from './gist'
import { isDistantUrlValid, receiveFromURL } from './url'
import onSettingsLoad from '../../utils/onsettingsload'
import networkForm from '../../utils/networkform'
import { fadeOut } from '../../utils'
import storage from '../../storage'

type SyncType = Sync.SettingsSync['type']
type SyncFreq = Sync.SettingsSync['freq']

interface SyncUpdate {
	type?: string
	freq?: string
	url?: string
	status?: string
	gistToken?: string
	down?: true
	up?: true
}

const gistsyncform = networkForm('f_gistsync')
const urlsyncform = networkForm('f_urlsync')

export default function synchronization(init?: Sync.Storage, update?: SyncUpdate) {
	if (init) {
		onSettingsLoad(async function () {
			const local = await storage.local.get(['gistToken', 'distantUrl'])
			const sync = init.settingssync
			toggleSyncSettingsOption(sync, local)
		})
	}

	if (update) {
		updateSyncOption(update)
	}
}

async function updateSyncOption(update: SyncUpdate) {
	const data = await storage.sync.get()
	const local = await storage.local.get(['gistId', 'gistToken', 'distantUrl'])
	const sync = data.settingssync

	if (update.down) {
		if (sync.type === 'gist') {
			gistsyncform.load()

			try {
				const id = local.gistId ?? ''
				const token = local.gistToken ?? ''
				const update = await retrieveGist(token, id)

				storage.sync.set(update)
				fadeOut()
			} catch (err) {
				gistsyncform.warn(err as string)
			}
		}

		if (sync.type === 'url') {
			urlsyncform.load()

			try {
				const update = await receiveFromURL(local.distantUrl)
				storage.sync.set(update)
				fadeOut()
			} catch (err) {
				urlsyncform.warn(err as string)
			}
		}
	}

	if (update.up) {
		if (sync.type === 'gist') {
			gistsyncform.load()

			try {
				const token = local.gistToken ?? ''
				const id = await sendGist(token, local.gistId, data)

				gistsyncform.accept()
				storage.local.set({ gistId: id })
			} catch (error) {
				gistsyncform.warn(error as string)
			}
		}
	}

	// if (update.status) {
	// 	if (update.status === 'gist') {
	// 		document.getElementById('gist-sync-status')?.classList.toggle('shown')
	// 		return
	// 	}
	// }

	if (update.gistToken === '') {
		local.gistToken = ''
		storage.local.remove('gistToken')
		toggleSyncSettingsOption(sync, local)
		return
	}

	if (update.url === '') {
		local.distantUrl = ''
		storage.local.remove('distantUrl')
		toggleSyncSettingsOption(sync, local)
		return
	}

	if (update.gistToken) {
		gistsyncform.load()

		try {
			local.gistToken = update.gistToken
			local.gistId = await findGistId(local.gistToken)

			gistsyncform.accept()
			storage.local.set(local)
			toggleSyncSettingsOption(sync, local)
		} catch (error) {
			gistsyncform.warn(error as string)
		}
	}

	if (update.url) {
		urlsyncform.load()

		try {
			await receiveFromURL(update.url)
			urlsyncform.accept('i_urlsync', update.url)

			local.distantUrl = update.url
			storage.local.set({ distantUrl: update.url })
			toggleSyncSettingsOption(sync, local)
		} catch (error) {
			urlsyncform.warn(error as string)
		}
	}

	if (update.type && isSyncType(update.type)) {
		const toLocal = update.type !== 'auto'
		const toSync = update.type === 'auto'

		sync.type = update.type
		toggleSyncSettingsOption(sync, local)

		// <!> Set & return here because
		// <!> awaits in if() doesn't have priority

		if (toLocal) {
			await chrome.storage.sync.clear()
			await chrome.storage.local.set({ syncStorage: data })
			sessionStorage.setItem('WEBEXT_LOCAL', 'yes')
		}

		if (toSync) {
			await chrome.storage.local.remove('syncStorage')
			await chrome.storage.sync.set(data)
			sessionStorage.removeItem('WEBEXT_LOCAL')
		}
	}
}

async function toggleSyncSettingsOption(sync: Sync.SettingsSync, local?: Local.Storage) {
	const gistToken = local?.gistToken
	const distantUrl = local?.distantUrl

	const i_gistsync = document.querySelector<HTMLInputElement>('#i_gistsync')
	const i_urlsync = document.querySelector<HTMLInputElement>('#i_urlsync')
	const b_gistdown = document.querySelector<HTMLInputElement>('#b_gistdown')
	const b_gistup = document.querySelector<HTMLInputElement>('#b_gistup')
	const b_urldown = document.querySelector<HTMLInputElement>('#b_urldown')

	b_gistdown?.setAttribute('disabled', '')
	b_urldown?.setAttribute('disabled', '')
	b_gistup?.setAttribute('disabled', '')

	if (i_gistsync && gistToken) {
		i_gistsync.value = gistToken
	}
	if (i_urlsync && distantUrl) {
		i_urlsync.value = distantUrl
	}

	switch (sync.type) {
		case 'off':
		case 'auto': {
			document.getElementById('url-sync')?.classList.remove('shown')
			document.getElementById('sync-freq')?.classList.remove('shown')
			document.getElementById('gist-sync')?.classList.remove('shown')
			break
		}

		case 'gist': {
			document.getElementById('gist-sync')?.classList.add('shown')
			document.getElementById('url-sync')?.classList.remove('shown')

			if (await isGistTokenValid(gistToken)) {
				b_gistdown?.removeAttribute('disabled')
				b_gistup?.removeAttribute('disabled')
			}

			break
		}

		case 'url': {
			document.getElementById('url-sync')?.classList.add('shown')
			document.getElementById('gist-sync')?.classList.remove('shown')

			if (await isDistantUrlValid(distantUrl)) {
				b_urldown?.removeAttribute('disabled')
			}

			break
		}
	}
}

// Type check

function isSyncType(val: string): val is SyncType {
	return ['auto', 'gist', 'url', 'off'].includes(val)
}

function isSyncFreq(val: string): val is SyncFreq {
	return ['newtabs', 'start', 'manual'].includes(val)
}
