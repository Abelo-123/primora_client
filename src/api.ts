import type {
    Service, Deposit,
    AuthResponse, OrderResponse, OrdersListResponse,
    DepositResponse, AlertsResponse, StatusSyncResponse,
    CustomField,
} from './types';
import { getInitDataRaw } from './helpers/telegram';

export const NODE_API_URL = import.meta.env.VITE_NODE_API_URL || 'https://primore-admin-server.onrender.com/api';

const isDev = import.meta.env.DEV;

function debug(...args: any[]) {
    if (isDev) console.log(...args);
}

function debugError(...args: any[]) {
    if (isDev) console.error(...args);
}

async function nodeApiFetch<T>(
    endpoint: string,
    options?: RequestInit
): Promise<T> {
    let url = `${NODE_API_URL}${endpoint}`;
    
    // Prepare headers
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> || {}),
    };

    const initData = getInitDataRaw() || '';
    let body = options?.body;

    // Auto-inject initData
    if (options?.method === 'POST' || options?.method === 'PUT') {
        if (typeof body === 'string') {
            try {
                const parsed = JSON.parse(body);
                if (!parsed.initData) parsed.initData = initData;
                body = JSON.stringify(parsed);
            } catch(e) {}
        } else if (!body) {
            body = JSON.stringify({ initData });
        }
    } else {
        // GET requests: append initData to query params
        const sep = url.includes('?') ? '&' : '?';
        url += `${sep}initData=${encodeURIComponent(initData)}`;
    }

    debug('[API] Fetching:', url);

    // Safely create abort controller for older WebViews
    let controller: AbortController | undefined;
    let signal: AbortSignal | undefined;
    if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        signal = controller.signal;
    }
    
    const timeoutId = setTimeout(() => {
        if (controller) controller.abort();
    }, 15000);

    try {
        const res = await fetch(url, {
            ...options,
            headers,
            body,
            signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const errorText = await res.text();
            debugError('[API] Error:', res.status, errorText);
            throw new Error(errorText || `HTTP ${res.status}`);
        }

        const data = await res.json();
        debug('[API] Success:', endpoint);
        return data;
    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('Request timeout - please check your connection');
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Endpoints directly via Node API
// ---------------------------------------------------------------------------

export async function authenticateTelegram(initData: string): Promise<AuthResponse> {
    return nodeApiFetch<AuthResponse>('/app/auth', {
        method: 'POST',
        body: JSON.stringify({ initData }),
    });
}

const SERVICES_CACHE_KEY = 'primora_services_cache';
const SERVICES_TIMESTAMP_KEY = 'primora_services_timestamp';
const SETTINGS_CACHE_KEY = 'primora_settings_cache';
const SETTINGS_TIMESTAMP_KEY = 'primora_settings_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache for services (SWR pattern)
const SETTINGS_CACHE_DURATION = 1 * 60 * 1000; // 1 minute cache for settings

export async function getServices(useCache = true, forceRefresh = false): Promise<Service[]> {
    if (useCache && !forceRefresh) {
        try {
            const cached = localStorage.getItem(SERVICES_CACHE_KEY);
            const timestamp = localStorage.getItem(SERVICES_TIMESTAMP_KEY);
            if (cached && timestamp) {
                const age = Date.now() - parseInt(timestamp);
                if (age < CACHE_DURATION) {
                    try {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed)) return parsed;
                    } catch(e) {}
                }
            }
        } catch (e) {}
    }

    try {
        const endpoint = forceRefresh ? '/services?refresh=1' : '/services';
        const data = await nodeApiFetch<any>(endpoint);
        const validData = Array.isArray(data) ? data : [];
        if (validData.length > 0) {
            localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify(validData));
            localStorage.setItem(SERVICES_TIMESTAMP_KEY, Date.now().toString());
        }
        return validData;
    } catch (err) {
        const cached = localStorage.getItem(SERVICES_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) return parsed;
            } catch(e) {}
        }
        return [];
    }
}

export async function refreshServices(): Promise<Service[]> {
    try {
        const data = await nodeApiFetch<any>('/services?refresh=1');
        const validData = Array.isArray(data) ? data : [];
        if (validData.length > 0) {
            localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify(validData));
            localStorage.setItem(SERVICES_TIMESTAMP_KEY, Date.now().toString());
        }
        return validData;
    } catch (err) {
        return [];
    }
}

export async function getServicesByCategory(category?: string, ids?: number[], forceRefresh = false): Promise<Service[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (ids && ids.length > 0) params.append('ids', ids.join(','));
    if (forceRefresh) params.append('refresh', '1');
    
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await nodeApiFetch<any>(`/services${qs}`);
    return Array.isArray(data) ? data : [];
}
export interface CategoriesResponse {
    success: boolean;
    categories: string[];
    total: number;
    cached?: boolean;
}

export async function getCategories(platform?: string): Promise<string[]> {
    const query = platform ? `?platform=${encodeURIComponent(platform)}` : '';
    const data = await nodeApiFetch<CategoriesResponse>(`/categories${query}`);
    return data.categories || [];
}

export async function getRecommended(): Promise<number[]> {
    return nodeApiFetch<number[]>('/app/recommended');
}

export interface PlaceOrderPayload {
    service: number;
    link: string;
    quantity: number;
    tg_id?: number;
    comments?: string;
    answer_number?: number;
    custom_fields?: CustomField[];
}

export async function placeOrder(payload: PlaceOrderPayload): Promise<OrderResponse> {
    return nodeApiFetch<OrderResponse>('/orders/place', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function getOrders(): Promise<OrdersListResponse> {
    return nodeApiFetch<OrdersListResponse>('/orders/list', { method: 'POST' });
}

export async function checkOrderStatus(): Promise<StatusSyncResponse> {
    return nodeApiFetch<StatusSyncResponse>('/orders/status', { method: 'POST' });
}

export async function requestRefill(orderId: number): Promise<{ success: boolean; message: string }> {
    return nodeApiFetch('/orders/refill', {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId }),
    });
}

export async function processDeposit(amount: number, referenceId: string): Promise<DepositResponse> {
    return nodeApiFetch<DepositResponse>('/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount, tx_ref: referenceId }),
    });
}

export async function getDeposits(initData: string): Promise<Deposit[]> {
    return nodeApiFetch<Deposit[]>('/deposits', {
        method: 'POST',
        body: JSON.stringify({ initData })
    });
}

export async function getBalance(initData: string): Promise<{ success: boolean; balance: number }> {
    return nodeApiFetch<{ success: boolean; balance: number }>('/balance', {
        method: 'POST',
        body: JSON.stringify({ initData })
    });
}

export async function getAlerts(): Promise<AlertsResponse> {
    return nodeApiFetch<AlertsResponse>('/app/alerts', { method: 'POST' });
}

export async function markAlertsRead(): Promise<{ success: boolean }> {
    return nodeApiFetch('/app/alerts/mark-read', { method: 'POST' });
}



export async function heartbeat(): Promise<{ ok: number }> {
    return nodeApiFetch('/app/heartbeat');
}

export async function logInitData(initData: string): Promise<{ success: boolean }> {
    return nodeApiFetch<{ success: boolean }>('/app/log-init-data', {
        method: 'POST',
        body: JSON.stringify({ initData }),
    });
}

export async function applyReferralCode(referralCode: string): Promise<{ success: boolean; message?: string; error?: string; newBalance?: number; referred_by?: string }> {
    return nodeApiFetch('/referral/apply', {
        method: 'POST',
        body: JSON.stringify({ referralCode }),
    });
}

export interface ReferredUser {
    tg_id: string;
    name: string;
    deposit_count: number;
    commission_earned: number;
}

export interface ReferralStatsResponse {
    success: boolean;
    totalEarned: number;
    referredList: ReferredUser[];
    error?: string;
}

export async function fetchReferralStats(): Promise<ReferralStatsResponse> {
    return nodeApiFetch('/referral/stats', {
        method: 'POST',
    });
}

export interface AppSettings {
    rateMultiplier: number;
    resellerMultiplier?: number;
    adminMargin?: number;
    panelMargin?: number;
    profitMargin?: number;
    admin_margin?: number;
    profit_margin?: number;
    discountPercent: number;
    holidayName: string;
    maintenanceMode: boolean;
    userCanOrder: boolean;
    marqueeText: string;
    topServicesIds: string;
    botUsername?: string;
}

export async function getSettings(useCache = true, forceRefresh = false): Promise<AppSettings> {
    if (useCache && !forceRefresh) {
        const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
        const timestamp = localStorage.getItem(SETTINGS_TIMESTAMP_KEY);
        if (cached && timestamp) {
            const age = Date.now() - parseInt(timestamp);
            if (age < SETTINGS_CACHE_DURATION) {
                return JSON.parse(cached);
            }
        }
    }

    try {
        const endpoint = forceRefresh ? '/app/settings?refresh=1' : '/app/settings';
        const data = await nodeApiFetch<AppSettings>(endpoint);
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(SETTINGS_TIMESTAMP_KEY, Date.now().toString());
        return data;
    } catch (err) {
        const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
        if (cached) return JSON.parse(cached);
        return {
            rateMultiplier: 1,
            discountPercent: 0,
            holidayName: '',
            maintenanceMode: false,
            userCanOrder: true,
            marqueeText: 'Welcome to Primora SMM!',
            topServicesIds: '',
            botUsername: 'Primora444_bot',
        };
    }
}

// ─── Withdrawal APIs ────────────────────────────────────────────────────────
export interface WithdrawalItem {
    id: number;
    user_id: string;
    amount: number;
    full_name: string;
    bank_name: string;
    account_number: string;
    status: 'pending' | 'done';
    created_at: string;
    username?: string;
    first_name?: string;
    last_name?: string;
}

export async function fetchWithdrawalHistory(): Promise<{ success: boolean; history: WithdrawalItem[]; referral_balance: number; error?: string }> {
    return nodeApiFetch('/withdraw/history', { method: 'GET' });
}

export interface RequestWithdrawalPayload {
    amount: number;
    full_name: string;
    bank_name: string;
    account_number: string;
}

export async function requestWithdrawal(payload: RequestWithdrawalPayload): Promise<{ success: boolean; new_referral_balance?: number; error?: string }> {
    return nodeApiFetch('/withdraw/request', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

// ─── Average Times API ──────────────────────────────────────────────────────
export async function getAverageTimes(forceRefresh = false): Promise<Record<string, string>> {
    try {
        const endpoint = forceRefresh ? '/average-times?action=refresh' : '/average-times';
        const res = await nodeApiFetch<{ success: boolean; data: Record<string, string> }>(endpoint);
        return res?.data || {};
    } catch (err) {
        debugError('[API] Failed to fetch average times:', err);
        return {};
    }
}

