import {
	createContext,
	createSignal,
	useContext,
	onMount,
	JSX,
	Accessor,
} from 'solid-js'
import { ConvexSolidClient } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenStorage {
	getItem(
		key: string,
	): string | null | undefined | Promise<string | null | undefined>
	setItem(key: string, value: string): void | Promise<void>
	removeItem(key: string): void | Promise<void>
}

export interface ConvexAuthActionsContext {
	signIn(
		provider: string,
		params?:
			| FormData
			| (Record<string, unknown> & {
					redirectTo?: string
					code?: string
			  }),
	): Promise<{
		signingIn: boolean
		redirect?: URL
	}>
	signOut(): Promise<void>
}

export interface ConvexAuthState {
	isLoading: Accessor<boolean>
	isAuthenticated: Accessor<boolean>
}

function storageKey(namespace: string, name: string) {
	return `__convexAuth_${namespace.replace(/[^a-zA-Z0-9]/g, '')}_${name}`
}

const AuthActionsCtx = createContext<ConvexAuthActionsContext | null>(null)
const AuthStateCtx = createContext<ConvexAuthState | null>(null)
const AuthTokenCtx = createContext<Accessor<string | null>>(() => null)

export interface ConvexAuthProviderProps {
	client: ConvexSolidClient
	/** Custom token storage (defaults to localStorage) */
	storage?: TokenStorage
	/** Namespace for storage keys (defaults to deployment URL) */
	storageNamespace?: string
	/**
	 * Call this to strip the `code` query param from the URL after OAuth / magic
	 * link redirects. Required when using a JS router.
	 */
	replaceURL?: (relativeUrl: string) => void | Promise<void>
	/**
	 * Return false to skip handling the `code` URL param entirely.
	 */
	shouldHandleCode?: () => boolean
	children?: JSX.Element
}

const siteUrl = (import.meta as unknown as { env: Record<string, string> }).env

export const ConvexAuthProvider = (props: ConvexAuthProviderProps) => {
	const store: TokenStorage = props.storage ?? localStorage
	const namespace =
		props.storageNamespace ??
		// Pull deployment URL from the client (it's public)
		(props.client as unknown as { address: string }).address ??
		'default'

	const TOKEN_KEY = storageKey(namespace, 'token')
	const REFRESH_KEY = storageKey(namespace, 'refreshToken')
	const VERIFIER_KEY = storageKey(namespace, 'verifier')

	const [token, setToken] = createSignal<string | null>(null)
	const [isLoading, setIsLoading] = createSignal(true)
	const [isAuthenticated, setIsAuthenticated] = createSignal(false)

	// Internal: set auth to the Convex client
	function applyToken(jwt: string | null) {
		setToken(jwt)
		setIsAuthenticated(jwt !== null)
		props.client.setAuth(async () => jwt)
	}

	function clearAuth() {
		setToken(null)
		setIsAuthenticated(false)
		props.client.clearAuth()
	}

	// ── Boot: restore token from storage ────────────────────────────────────
	onMount(async () => {
		// Handle OAuth / magic-link redirect code in URL
		const url = new URL(window.location.href)
		const code = url.searchParams.get('code')
		const shouldHandle = props.shouldHandleCode
			? props.shouldHandleCode()
			: true

		if (code && shouldHandle) {
			try {
				const verifier = await store.getItem(VERIFIER_KEY)
				const result = await exchangeCode(code, verifier)
				if (result?.token) {
					await store.setItem(TOKEN_KEY, result.token)
					if (result.refreshToken)
						await store.setItem(REFRESH_KEY, result.refreshToken)
					applyToken(result.token)
					await store.removeItem(VERIFIER_KEY)
				}
			} catch (_) {
				// ignore
			} finally {
				// Strip code param
				const clean = new URL(window.location.href)
				clean.searchParams.delete('code')
				const relative =
					clean.pathname + (clean.search || '') + (clean.hash || '')
				if (props.replaceURL) {
					await props.replaceURL(relative)
				} else {
					window.history.replaceState({}, '', relative)
				}
			}
		} else {
			const stored = await store.getItem(TOKEN_KEY)
			if (stored) {
				// Verify token is still valid (optimistic, Convex will reject if not)
				applyToken(stored)
			} else {
				const refreshToken = await store.getItem(REFRESH_KEY)
				if (refreshToken) {
					try {
						const result = await refreshSession(refreshToken)
						if (result?.token) {
							await store.setItem(TOKEN_KEY, result.token)
							if (result.refreshToken)
								await store.setItem(
									REFRESH_KEY,
									result.refreshToken,
								)
							applyToken(result.token)
						} else {
							clearAuth()
						}
					} catch (_) {
						clearAuth()
					}
				} else {
					clearAuth()
				}
			}
		}
		setIsLoading(false)
	})

	// ── Actions ──────────────────────────────────────────────────────────────

	const actions: ConvexAuthActionsContext = {
		async signIn(provider, params) {
			const body: Record<string, unknown> = { provider }

			if (params instanceof FormData) {
				params.forEach((v, k) => {
					body[k] = v
				})
			} else if (params) {
				Object.assign(body, params)
			}

			// Call the convex auth HTTP action
			const response = await fetch(`${siteUrl}/api/auth/signin`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			if (!response.ok) {
				const text = await response.text()
				throw new Error(`Sign-in failed: ${text}`)
			}

			const data: {
				token?: string
				refreshToken?: string
				redirect?: string
				verifier?: string
			} = await response.json()

			if (data.redirect) {
				// OAuth or magic link — redirect the browser
				if (data.verifier) {
					await store.setItem(VERIFIER_KEY, data.verifier)
				}
				return { signingIn: false, redirect: new URL(data.redirect) }
			}

			if (data.token) {
				await store.setItem(TOKEN_KEY, data.token)
				if (data.refreshToken)
					await store.setItem(REFRESH_KEY, data.refreshToken)
				applyToken(data.token)
				return { signingIn: true }
			}

			// OTP / magic link sent — waiting for verification step
			return { signingIn: false }
		},

		async signOut() {
			try {
				const refreshToken = await store.getItem(REFRESH_KEY)
				await fetch(`${siteUrl}/api/auth/signout`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(token()
							? { Authorization: `Bearer ${token()}` }
							: {}),
					},
					body: JSON.stringify({ refreshToken }),
				})
			} catch (_) {
				// best-effort server invalidation
			} finally {
				await store.removeItem(TOKEN_KEY)
				await store.removeItem(REFRESH_KEY)
				clearAuth()
			}
		},
	}

	const authState: ConvexAuthState = { isLoading, isAuthenticated }

	return (
		<AuthActionsCtx.Provider value={actions}>
			<AuthStateCtx.Provider value={authState}>
				<AuthTokenCtx.Provider value={token}>
					{props.children}
				</AuthTokenCtx.Provider>
			</AuthStateCtx.Provider>
		</AuthActionsCtx.Provider>
	)
}

// ─── Internal fetch helpers (mirroring what @convex-dev/auth does internally) ─

async function exchangeCode(
	code: string,
	verifier?: string | null,
): Promise<{ token?: string; refreshToken?: string } | null> {
	const res = await fetch(`${siteUrl}/api/auth/callback`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code, ...(verifier ? { verifier } : {}) }),
	})
	if (!res.ok) return null
	return res.json()
}

async function refreshSession(
	refreshToken: string,
): Promise<{ token?: string; refreshToken?: string } | null> {
	const res = await fetch(`${siteUrl}/api/auth/refresh`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refreshToken }),
	})
	if (!res.ok) return null
	return res.json()
}

// ─── Public hooks ─────────────────────────────────────────────────────────────

export function useAuthActions(): ConvexAuthActionsContext {
	const ctx = useContext(AuthActionsCtx)
	if (!ctx)
		throw new Error(
			'useAuthActions must be used inside <ConvexAuthProvider>',
		)
	return ctx
}

export function useConvexAuth(): ConvexAuthState {
	const ctx = useContext(AuthStateCtx)
	if (!ctx)
		throw new Error(
			'useConvexAuth must be used inside <ConvexAuthProvider>',
		)
	return ctx
}

export function useAuthToken(): Accessor<string | null> {
	return useContext(AuthTokenCtx)
}
