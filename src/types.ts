// ─── Global Types ─────────────────────────────────────────────

export interface Service {
    id: number;
    service?: number;   // API uses 'service', some responses use 'id'
    category: string;
    name: string;
    type: ServiceType;
    rate: number;       // Price per 1000 in ETB (after rate_multiplier)
    original_rate: number; // Raw rate from the upstream API
    min: number;
    max: number;
    averageTime: string;
    refill: boolean;
    cancel: boolean;
    platform_id?: SocialPlatform;
    custom_description?: string | null;
}

declare global {
    interface Window {
        Telegram?: {
            WebApp?: {
                initData: string;
                initDataUnsafe: {
                    user?: any;
                    query_id?: string;
                };
            };
        };
    }
}

export type ServiceType =
    | 'Default'
    | 'Custom Comments'
    | 'Custom Comments Package'
    | 'Mentions with Hashtags'
    | 'Package'
    | 'Poll';

export type OrderStatus =
    | 'pending'
    | 'processing'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'partial';

export interface CustomField {
    type: 'text' | 'link' | 'comment' | 'hashtag' | 'note';
    label?: string;
    value: string;
}

export interface Order {
    id: number;
    api_order_id: number;
    service_id: number;
    service_name: string;
    link: string;
    quantity: number;
    charge: number;
    status: OrderStatus;
    remains: number;
    start_count: number;
    created_at: string;
    custom_fields?: CustomField[] | null;
}

export interface Deposit {
    id: number;
    amount: number;
    reference_id: string;
    status: 'completed' | 'success' | 'pending' | 'failed' | 'expired';
    method?: string;
    created_at: string;
}

export interface Alert {
    id: number;
    message: string;
    is_read: boolean;
    created_at: string;
}

export interface UserProfile {
    id: number;
    first_name: string;
    last_name?: string;
    display_name: string;
    photo_url: string;
    balance: number;
    username?: string;
    referral_code?: string;
    referred_by?: string;
    refers?: string[];
    phone_number?: string | null;
    phone_verified?: boolean;
    role?: string;
}

export interface Holiday {
    id: number;
    name: string;
    status: 'active' | 'inactive';
    start_date: string;
    end_date: string;
}

export type SocialPlatform =
    | 'instagram'
    | 'tiktok'
    | 'youtube'
    | 'facebook'
    | 'twitter'
    | 'telegram'
    | 'other'
    | 'top';

export type TabId = 'order' | 'history' | 'deposit' | 'more';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
}

// ─── API Response Types ───────────────────────────────────────

export interface AuthResponse {
    success: boolean;
    user: UserProfile;
}

export interface OrderResponse {
    success: boolean;
    order_id: number;
    api_order_id?: number;
    new_balance: number;
    verified?: boolean;
    provider_status?: string;
    error?: string;
}

export interface OrdersListResponse {
    orders: Order[];
}

export interface DepositResponse {
    status: string;
    new_balance: number;
}

export interface AlertsResponse {
    alerts: Alert[];
    unread_count: number;
}

export interface StatusSyncResponse {
    success: boolean;
    checked: number;
    updated: number;
    updates: Order[];
}

export interface SSEOrderPlaced {
    type: 'ORDER_PLACED';
    order: Order;
    new_balance?: number;
}

export interface SSEOrderUpdated {
    type: 'ORDER_UPDATED';
    order: Pick<Order, 'id' | 'api_order_id' | 'status' | 'start_count' | 'remains'>;
    refunded?: boolean;
}

export type SSEEvent =
    | { type: 'CONNECTED' }
    | SSEOrderPlaced
    | SSEOrderUpdated;
