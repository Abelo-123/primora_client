/**
 * Telegram SDK Helpers
 *
 * Centralized wrappers around @telegram-apps/sdk-react so the rest
 * of the codebase never touches `(window as any).Telegram` directly.
 *
 * Every helper is safe to call outside Telegram (browser dev mode) —
 * it will simply no-op.
 */
import type { RGB } from '@telegram-apps/sdk-react';
import {
    hapticFeedback,
    mainButton,
    closingBehavior,
    cloudStorage,
    initData,
    viewport,
    miniApp,
    retrieveLaunchParams,
    openLink as sdkOpenLink,
    openTelegramLink as sdkOpenTelegramLink,
    requestFullscreen as sdkRequestFullscreen,
    popup,
} from '@telegram-apps/sdk-react';

// ─── Environment Detection ──────────────────────────────────
let _isTelegramCached: boolean | null = null;

/**
 * Returns `true` when running inside a real Telegram Mini App.
 * Uses retrieveLaunchParams() which throws outside Telegram.
 * Caches the result after the first call.
 */
export function isTelegramEnv(): boolean {
    if (_isTelegramCached !== null) return _isTelegramCached;
    try {
        retrieveLaunchParams();
        _isTelegramCached = true;
    } catch {
        _isTelegramCached = false;
    }
    return _isTelegramCached;
}

/**
 * Returns the Telegram platform string ('ios', 'android', 'macos', 'tdesktop', etc.)
 * or 'unknown' if outside Telegram.
 */
export function getTelegramPlatform(): string {
    try {
        return retrieveLaunchParams().tgWebAppPlatform;
    } catch {
        return 'unknown';
    }
}

/**
 * Returns true if the user is on iOS or macOS (for iOS-style UI).
 */
export function isApplePlatform(): boolean {
    const p = getTelegramPlatform();
    return ['ios', 'macos'].includes(p);
}

// ─── Haptic Feedback ────────────────────────────────────────

export function hapticSelection(): void {
    try {
        if (hapticFeedback.selectionChanged.isAvailable()) {
            hapticFeedback.selectionChanged();
        }
    } catch { /* noop outside Telegram */ }
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium'): void {
    try {
        if (hapticFeedback.impactOccurred.isAvailable()) {
            hapticFeedback.impactOccurred(style);
        }
    } catch { /* noop */ }
}

export function hapticNotification(type: 'success' | 'warning' | 'error'): void {
    try {
        if (hapticFeedback.notificationOccurred.isAvailable()) {
            hapticFeedback.notificationOccurred(type);
        }
    } catch { /* noop */ }
}

// ─── Cloud Storage ──────────────────────────────────────────

export async function cloudSet(key: string, value: string): Promise<void> {
    try {
        if (cloudStorage.setItem.isAvailable()) {
            await cloudStorage.setItem(key, value);
        }
    } catch { /* noop */ }
}

export async function cloudGet(key: string): Promise<string | undefined> {
    try {
        if (cloudStorage.getItem.isAvailable()) {
            return await cloudStorage.getItem(key);
        }
    } catch { /* noop */ }
    return undefined;
}

export async function cloudDelete(key: string): Promise<void> {
    try {
        if (cloudStorage.deleteItem.isAvailable()) {
            await cloudStorage.deleteItem(key);
        }
    } catch { /* noop */ }
}

/**
 * Batch-get multiple keys from cloud storage at once.
 * Returns a Record<string, string> with only found keys.
 */
export async function cloudGetMultiple(keys: string[]): Promise<Record<string, string>> {
    try {
        if (cloudStorage.getItem.isAvailable()) {
            const result: Record<string, string> = {};
            // Get all keys concurrently
            const entries = await Promise.all(
                keys.map(async k => {
                    const val = await cloudStorage.getItem(k);
                    return [k, val] as const;
                })
            );
            for (const [k, v] of entries) {
                if (v !== undefined && v !== '') result[k] = v;
            }
            return result;
        }
    } catch { /* noop */ }
    return {};
}

// ─── Closing Behavior ───────────────────────────────────────

export function enableClosingConfirmation(): void {
    try {
        if (closingBehavior.enableConfirmation.isAvailable()) {
            closingBehavior.enableConfirmation();
        }
    } catch { /* noop */ }
}

export function disableClosingConfirmation(): void {
    try {
        if (closingBehavior.disableConfirmation.isAvailable()) {
            closingBehavior.disableConfirmation();
        }
    } catch { /* noop */ }
}

// ─── Main Button ────────────────────────────────────────────

interface MainButtonConfig {
    text: string;
    color?: string;
    textColor?: string;
    isEnabled?: boolean;
    isVisible?: boolean;
    isLoaderVisible?: boolean;
}

export function configureMainButton(config: MainButtonConfig): void {
    try {
        if (mainButton.setParams.isAvailable()) {
            mainButton.setParams({
                text: config.text,
                backgroundColor: config.color as RGB | undefined,
                textColor: config.textColor as RGB | undefined,
                isEnabled: config.isEnabled,
                isVisible: config.isVisible ?? true,
                isLoaderVisible: config.isLoaderVisible,
            });
        }
    } catch { /* noop */ }
}

export function showMainButton(): void {
    try {
        if (mainButton.setParams.isAvailable()) {
            mainButton.setParams({ isVisible: true });
        }
    } catch { /* noop */ }
}

export function hideMainButton(): void {
    try {
        if (mainButton.setParams.isAvailable()) {
            mainButton.setParams({ isVisible: false });
        }
    } catch { /* noop */ }
}

export function onMainButtonClick(callback: () => void): () => void {
    try {
        if (mainButton.onClick.isAvailable()) {
            return mainButton.onClick(callback);
        }
    } catch { /* noop */ }
    return () => { };
}

export function offMainButtonClick(callback: () => void): void {
    try {
        if (mainButton.offClick.isAvailable()) {
            mainButton.offClick(callback);
        }
    } catch { /* noop */ }
}

// ─── Viewport / Expand / Fullscreen ─────────────────────────

export function expandViewport(): void {
    try {
        if (viewport.expand.isAvailable()) {
            viewport.expand();
        }
    } catch { /* noop */ }
}

export async function requestFullscreen(): Promise<void> {
    try {
        if (sdkRequestFullscreen.isAvailable()) {
            await sdkRequestFullscreen();
        }
    } catch { /* noop — not supported on older clients */ }
}

// ─── Init Data ──────────────────────────────────────────────

export function getInitDataUser() {
    try {
        const state = initData.state();
        if (state?.user) return state.user;
    } catch {}
    
    try {
        const raw = getInitDataRaw();
        if (raw) {
            // Parse query-string format of initData
            const params = new URLSearchParams(raw);
            const userStr = params.get('user');
            if (userStr) {
                return JSON.parse(userStr);
            }
        }
    } catch {}
    return null;
}

/**
 * Retrieves the current bot ID directly from the Telegram WebApp JS SDK
 */
export function getTelegramBotId(): string | null {
    try {
        // 1. Try to read from native Telegram WebApp window object
        const tg = (window as any).Telegram?.WebApp;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.receiver && tg.initDataUnsafe.receiver.id) {
            return String(tg.initDataUnsafe.receiver.id);
        }
        
        // 2. Try retrieveLaunchParams
        const lp = retrieveLaunchParams() as any;
        if (lp.initData && lp.initData.receiver && lp.initData.receiver.id) {
            return String(lp.initData.receiver.id);
        }
    } catch (e) {}
    
    // 3. Fallback to parsing URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('bot_id') || null;
}


let _cachedInitDataString: string | null = null;

// Eagerly try to cache initData from launch parameters on import
try {
    const raw = retrieveLaunchParams().initDataRaw;
    if (typeof raw === 'string') {
        _cachedInitDataString = raw;
    }
} catch (e) {}

export function getInitDataRaw(): string | undefined {
    if (_cachedInitDataString) return _cachedInitDataString;

    try {
        const raw = retrieveLaunchParams().initDataRaw;
        if (typeof raw === 'string') {
            _cachedInitDataString = raw;
            return raw;
        }
    } catch (e) {}

    try {
        const raw = typeof (initData as any).raw === 'function'
            ? (initData as any).raw()
            : (initData as any).raw;
        if (typeof raw === 'string') {
            _cachedInitDataString = raw;
            return raw;
        }
    } catch (e) {}

    return undefined;
}

export async function getInitDataString(): Promise<string> {
    const raw = getInitDataRaw();
    return raw || '';
}

// ─── Mini App Lifecycle ─────────────────────────────────────

export function signalReady(): void {
    try {
        if (miniApp.ready.isAvailable()) {
            miniApp.ready();
        }
    } catch { /* noop */ }
}

// ─── Header / Background Color ──────────────────────────────

/**
 * Sets the Telegram header bar color to match the app theme.
 * Accepts any hex color string (e.g. '#1a1a2e').
 */
export function setHeaderColor(color: string): void {
    try {
        if (miniApp.setHeaderColor.isAvailable()) {
            miniApp.setHeaderColor(color as RGB);
        }
    } catch { /* noop */ }
}

/**
 * Sets the Telegram mini app background color.
 * Useful for making the bottom sheet background match your UI.
 */
export function setBackgroundColor(color: string): void {
    try {
        if (miniApp.setBackgroundColor.isAvailable()) {
            miniApp.setBackgroundColor(color as RGB);
        }
    } catch { /* noop */ }
}

/**
 * Sets the Telegram mini app theme.
 * Use 'dark' to switch to dark theme, 'light' for light theme, 'system' for auto.
 * Note: Not available in all SDK versions - will fail silently if unavailable.
 */
export function setTheme(theme: 'light' | 'dark' | 'system'): void {
    try {
        // Use window.Telegram.WebApp directly as fallback since SDK may not expose this
        const tg = (window as any).Telegram?.WebApp;
        if (tg && tg.theme && typeof tg.theme === 'function') {
            tg.theme(theme);
        }
    } catch { /* noop */ }
}

// ─── Native Links ───────────────────────────────────────────

/**
 * Opens a URL in Telegram's native in-app browser.
 * Falls back to window.open outside Telegram.
 */
export function openLink(url: string, tryInstantView = false): void {
    try {
        // Use SDK's openLink if available
        if (sdkOpenLink && sdkOpenLink.isAvailable()) {
            sdkOpenLink(url, { tryInstantView });
            return;
        }
    } catch { /* fallthrough */ }
    window.open(url, '_blank');
}

/**
 * Opens a Telegram-specific URL (t.me link).
 * Falls back to window.open outside Telegram.
 */
export function openTelegramLink(url: string): void {
    try {
        if (sdkOpenTelegramLink && sdkOpenTelegramLink.isAvailable()) {
            sdkOpenTelegramLink(url);
            return;
        }
    } catch { /* fallthrough */ }
    window.open(url, '_blank');
}

// ─── Native Popup / Confirm ─────────────────────────────────

interface PopupButton {
    id: string;
    text: string;
    type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
}

/**
 * Shows a native Telegram popup with custom buttons.
 * Returns the ID of the pressed button, or null if dismissed.
 * Falls back to window.confirm outside Telegram.
 */
export async function showPopup(options: {
    title?: string;
    message: string;
    buttons?: PopupButton[];
    }): Promise<string | null> {
    try {
        if (popup.show.isAvailable()) {
            return await popup.show({
                title: options.title,
                message: options.message,
                buttons: options.buttons ?? [{ id: 'ok', type: 'ok', text: 'OK' }],
            });
        }
    } catch { /* fallthrough */ }
    // Fallback for non-Telegram environments
    const confirmed = window.confirm(
        (options.title ? options.title + '\n\n' : '') + options.message
    );
    return confirmed ? 'ok' : null;
}

/**
 * Shows a native confirm dialog with OK/Cancel.
 * Returns true if the user confirmed.
 */
export async function showConfirm(message: string, title?: string): Promise<boolean> {
    const result = await showPopup({
        title,
        message,
        buttons: [
            { id: 'cancel', type: 'cancel', text: 'Cancel' },
            { id: 'ok', type: 'ok', text: 'OK' },
        ],
    });
    return result === 'ok';
}

/**
 * Shows a native alert dialog with a single OK button.
 */
export async function showAlert(message: string, title?: string): Promise<void> {
    await showPopup({
        title,
        message,
        buttons: [{ id: 'ok', type: 'ok', text: 'OK' }],
    });
}
