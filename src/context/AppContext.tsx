import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { UserProfile, Service, Order, Deposit, Alert, TabId, ToastMessage, SocialPlatform } from '../types';
import { TOAST_DURATION } from '../constants';
import {
    isTelegramEnv,
    hapticSelection,
    cloudSet,
    cloudGet,
    getInitDataUser,
    getInitDataString,
    getInitDataRaw,
} from '../helpers/telegram';
import * as api from '../api';
import Swal from 'sweetalert2';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface AppState {
    user: UserProfile | null;
    isTelegramApp: boolean;
    services: Service[];
    recommendedIds: number[];
    selectedPlatform: SocialPlatform | null;
    selectedCategory: string | null;
    selectedService: Service | null;
    orders: Order[];
    deposits: Deposit[];
    alerts: Alert[];
    rateMultiplier: number;
    adminMargin: number;
    discountPercent: number;
    holidayName: string;
    maintenanceMode: boolean;
    userCanOrder: boolean;
    marqueeText: string;
    botUsername: string;
    activeTab: TabId;
    toasts: ToastMessage[];
    isLoading: boolean;
    unreadAlerts: number;
    isSyncingBalance: boolean;
    isSyncingServices: boolean;
    isSyncingOrders: boolean;
    isSyncingDeposits: boolean;
    isSyncingAlerts: boolean;
}

interface AppActions {
    setUser: (user: UserProfile | null) => void;
    setActiveTab: (tab: TabId) => void;
    setSelectedPlatform: (p: SocialPlatform | null) => void;
    setSelectedCategory: (c: string | null) => void;
    setSelectedService: (s: Service | null) => void;
    setOrders: (orders: Order[]) => void;
    setDeposits: (deposits: Deposit[]) => void;
    setAlerts: (alerts: Alert[]) => void;
    setBalance: (balance: number) => void;
    setIsLoading: (loading: boolean) => void;
    setUnreadAlerts: (count: number) => void;
    showToast: (type: ToastMessage['type'], message: string) => void;
    removeToast: (id: string) => void;
    refreshServices: () => Promise<void>;
    refreshOrders: () => Promise<void>;
    refreshDeposits: () => Promise<void>;
    refreshAlerts: () => Promise<void>;
}

type AppContextType = AppState & AppActions;

const AppContext = createContext<AppContextType | null>(null);

export function useApp(): AppContextType {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
    const isTelegramApp = isTelegramEnv();

    // Track whether we've logged the user's initData payload to the backend
    const initDataLoggedRef = useRef(false);

    const USER_CACHE_KEY = 'paxyo_user_cache';

    const [user, setUserState] = useState<UserProfile | null>(() => {
        try {
            const cachedStr = localStorage.getItem(USER_CACHE_KEY);
            const cached = cachedStr ? JSON.parse(cachedStr) : null;
            const tgUser = getInitDataUser();

            if (tgUser) {
                const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'User';
                return {
                    id: tgUser.id,
                    first_name: tgUser.first_name || (cached?.first_name || 'User'),
                    last_name: tgUser.last_name || (cached?.last_name || ''),
                    username: tgUser.username || (cached?.username || ''),
                    display_name: displayName,
                    photo_url: tgUser.photo_url || (cached?.photo_url || ''),
                    balance: cached?.balance !== undefined ? parseFloat(cached.balance) : 0,
                    referral_code: cached?.referral_code,
                    referred_by: cached?.referred_by,
                    refers: cached?.refers,
                    phone_number: cached?.phone_number,
                    phone_verified: cached?.phone_verified,
                };
            }

            if (cached) return cached;
        } catch (e) { }
        return null;
    });

    const setUser = useCallback((newUser: UserProfile | null | ((prev: UserProfile | null) => UserProfile | null)) => {
        setUserState(prev => {
            const updated = typeof newUser === 'function' ? newUser(prev) : newUser;
            if (updated) {
                try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(updated)); } catch (e) {}
            }
            return updated;
        });
    }, []);
    const [services, setServices] = useState<Service[]>([]);
    const [recommendedIds, setRecommendedIds] = useState<number[]>([]);
    const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatform | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [deposits, setDeposits] = useState<Deposit[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [activeTab, setActiveTab] = useState<TabId>('order');
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [unreadAlerts, setUnreadAlerts] = useState(0);

    const [isSyncingBalance, setIsSyncingBalance] = useState(false);
    const [isSyncingServices, setIsSyncingServices] = useState(false);
    const [isSyncingDeposits, setIsSyncingDeposits] = useState(false);
    const [isSyncingAlerts, setIsSyncingAlerts] = useState(false);

    const [settings, _setSettings] = useState({
        rateMultiplier: 200,
        adminMargin: 90,
        discountPercent: 0,
        holidayName: '',
        maintenanceMode: false,
        userCanOrder: true,
        marqueeText: 'Welcome to Primora SMM!',
        topServicesIds: '',
        botUsername: 'Primora444_bot',
    });

    const refreshServices = useCallback(async () => {
        setIsSyncingServices(true);
        try {
            // Force refresh from live DB / upstream
            const data = await api.getServices(false, true);
            const transformed: Service[] = data.map((s: any) => ({
                id: s.service || s.id,
                category: s.category,
                name: s.name,
                type: s.type as Service['type'],
                rate: parseFloat(s.rate),
                original_rate: parseFloat(s.original_rate ?? s.rate),
                min: s.min,
                max: s.max,
                averageTime: s.average_time || s.averageTime || '',
                refill: s.refill,
                cancel: s.cancel,
                custom_description: s.custom_description,
            }));
            setServices(transformed);
            queryClient.invalidateQueries({ queryKey: ['services'] });
        } catch (err) {
            console.error('Failed to fetch services:', err);
        } finally {
            setIsSyncingServices(false);
        }
    }, []);

    const queryClient = useQueryClient();

    // Use React Query for orders - Single Source of Truth
    const { data: qOrders = [], refetch: refreshOrders, isFetching: isSyncingOrders } = useQuery<Order[]>({
        queryKey: ['orders'],
        queryFn: async () => {
            // Check status asynchronously without blocking order list fetch
            api.checkOrderStatus().catch(e => console.error('[Orders Sync] Sync with provider failed:', e));
            const data = await api.getOrders();
            return data.orders || [];
        },
        staleTime: 30000, 
    });

    // Backwards compatibility for components still using setOrders
    const setOrders = useCallback((newOrders: Order[] | ((old: Order[]) => Order[])) => {
        queryClient.setQueryData(['orders'], newOrders);
    }, [queryClient]);

    const orders = qOrders;

    const refreshDeposits = useCallback(async () => {
        setIsSyncingDeposits(true);
        try {
            const initData = await getInitDataString();
            const data = await api.getDeposits(initData);
            setDeposits(data);
        } catch (err) {
            console.error('Failed to refresh deposits:', err);
        } finally {
            setIsSyncingDeposits(false);
        }
    }, []);

    const refreshAlerts = useCallback(async () => {
        setIsSyncingAlerts(true);
        try {
            const initData = await getInitDataString();
            if (initData) {
                const data = await api.getAlerts();
                if (data) {
                    setAlerts(data.alerts || []);
                    setUnreadAlerts(data.unread_count ?? 0);
                }
            }
        } catch (err) {
            console.error('Failed to refresh alerts:', err);
        } finally {
            setIsSyncingAlerts(false);
        }
    }, [setAlerts, setUnreadAlerts]);

    useEffect(() => {
        const loadData = async () => {
            let hasCachedServices = false;

            // Phase 1: Instant Display (0ms latency from localStorage)
            try {
                const cachedServices = localStorage.getItem('primora_services_cache');
                if (cachedServices) {
                    const parsed = JSON.parse(cachedServices);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const transformed: Service[] = parsed.map((s: any) => ({
                            id: s.service || s.id,
                            category: s.category,
                            name: s.name,
                            type: s.type as Service['type'],
                            rate: parseFloat(s.rate),
                            original_rate: parseFloat(s.original_rate ?? s.rate),
                            min: s.min,
                            max: s.max,
                            averageTime: s.average_time || s.averageTime || '',
                            refill: s.refill,
                            cancel: s.cancel,
                            custom_description: s.custom_description,
                        }));
                        setServices(transformed);
                        hasCachedServices = true;
                    }
                }
                const cachedSettings = localStorage.getItem('primora_settings_cache');
                if (cachedSettings) {
                    const settingsData = JSON.parse(cachedSettings);
                    if (settingsData) {
                        const parsedAdminMargin = typeof settingsData.adminMargin === 'number' 
                            ? settingsData.adminMargin 
                            : (typeof settingsData.profitMargin === 'number' ? settingsData.profitMargin : 90);
                        const parsedRateMultiplier = typeof settingsData.resellerMultiplier === 'number'
                            ? settingsData.resellerMultiplier
                            : (typeof settingsData.rateMultiplier === 'number' ? settingsData.rateMultiplier : 200);
                        _setSettings({
                            rateMultiplier: parsedRateMultiplier,
                            adminMargin: parsedAdminMargin,
                            discountPercent: settingsData.discountPercent || 0,
                            holidayName: settingsData.holidayName || '',
                            maintenanceMode: settingsData.maintenanceMode || false,
                            userCanOrder: settingsData.userCanOrder !== false,
                            marqueeText: settingsData.marqueeText || 'Welcome to Primora SMM!',
                            topServicesIds: settingsData.topServicesIds || '',
                            botUsername: settingsData.botUsername || 'Primora444_bot',
                        });
                        if (settingsData.topServicesIds) {
                            const parsedIds = settingsData.topServicesIds
                                .split(',')
                                .map((s: string) => parseInt(s.trim(), 10))
                                .filter((n: number) => !isNaN(n));
                            setRecommendedIds(parsedIds);
                        }
                    }
                }
            } catch (e) { }

            // If we have cached services, hide loader immediately so user can explore right away
            if (!hasCachedServices) {
                setIsLoading(true);
            } else {
                setIsLoading(false);
            }

            // Phase 2 & 3: Background Real-Time Data Pipeline
            try {
                const initData = await getInitDataString();

                // 2a. Priority 1: User Auth & Balance (instant DB query)
                if (initData) {
                    setIsSyncingBalance(true);
                    api.getBalance(initData).then(res => {
                        if (res.success) setBalance(res.balance);
                    }).catch(() => { }).finally(() => setIsSyncingBalance(false));
                }

                // 2b. Priority 2: Real-time Services & Settings from DB (forceRefresh = true)
                setIsSyncingServices(true);
                await Promise.allSettled([
                    (async () => {
                        try {
                            const servicesData = await api.getServices(false, true);
                            const transformed: Service[] = servicesData.map((s: any) => ({
                                id: s.service || s.id,
                                category: s.category,
                                name: s.name,
                                type: s.type as Service['type'],
                                rate: parseFloat(s.rate),
                                original_rate: parseFloat(s.original_rate ?? s.rate),
                                min: s.min,
                                max: s.max,
                                averageTime: s.average_time || s.averageTime || '',
                                refill: s.refill,
                                cancel: s.cancel,
                                custom_description: s.custom_description,
                            }));
                            if (transformed.length > 0) {
                                setServices(transformed);
                                queryClient.invalidateQueries({ queryKey: ['services'] });
                            }
                        } catch (err) {
                            console.error('Failed to load real-time services:', err);
                        }
                    })(),

                    (async () => {
                        try {
                            const settingsData = await api.getSettings(false, true);
                            const oldMultiplier = settings.rateMultiplier;
                            const parsedAdminMargin = typeof settingsData.adminMargin === 'number' 
                                ? settingsData.adminMargin 
                                : (typeof (settingsData as any).profitMargin === 'number' ? (settingsData as any).profitMargin : 90);
                            const parsedRateMultiplier = typeof settingsData.resellerMultiplier === 'number'
                                ? settingsData.resellerMultiplier
                                : (typeof settingsData.rateMultiplier === 'number' ? settingsData.rateMultiplier : 200);
                            _setSettings({
                                rateMultiplier: parsedRateMultiplier,
                                adminMargin: parsedAdminMargin,
                                discountPercent: settingsData.discountPercent || 0,
                                holidayName: settingsData.holidayName || '',
                                maintenanceMode: settingsData.maintenanceMode || false,
                                userCanOrder: settingsData.userCanOrder !== false,
                                marqueeText: settingsData.marqueeText || 'Welcome to Primora SMM!',
                                topServicesIds: settingsData.topServicesIds || '',
                                botUsername: settingsData.botUsername || 'Primora444_bot',
                            });

                            if (oldMultiplier !== settingsData.rateMultiplier) {
                                queryClient.invalidateQueries({ queryKey: ['services'] });
                            }

                            if (settingsData.topServicesIds) {
                                const parsedIds = settingsData.topServicesIds
                                    .split(',')
                                    .map(s => parseInt(s.trim(), 10))
                                    .filter(n => !isNaN(n));
                                setRecommendedIds(parsedIds);
                            } else {
                                setRecommendedIds([]);
                            }
                        } catch (err) {
                            console.error('Failed to load real-time settings:', err);
                        }
                    })()
                ]);
                setIsSyncingServices(false);

                // 2c. Background Pre-fetch Categories for all social media platforms
                const platforms = ['telegram', 'instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'other'];
                platforms.forEach(platform => {
                    queryClient.prefetchQuery({
                        queryKey: ['categories', platform],
                        queryFn: () => api.getCategories(platform),
                        staleTime: 5 * 60 * 1000,
                    }).catch(() => {});
                });

                // 2d. Priority 3: User Activity & History (orders, deposits, alerts)
                if (initData) {
                    refreshDeposits();
                    refreshOrders();
                }
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [refreshServices, refreshDeposits, refreshOrders]);

    const setBalance = useCallback((balance: number) => {
        setUser(prev => {
            if (!prev) return prev;
            const updated = { ...prev, balance };
            try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify(updated)); } catch (e) {}
            return updated;
        });
    }, [setUser]);

    const showToast = useCallback((type: ToastMessage['type'], message: string) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, TOAST_DURATION);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Cascading state resets were moved to explicit UI handlers (OrderPage)
    // to prevent race conditions during unified programmatic selection (SearchPanel).

    useEffect(() => {
        const loadUser = async () => {
            try {
                const tgUser = getInitDataUser();
                if (tgUser) {
                    const initData = await getInitDataString();

                    // Log init data once when we first see the user
                    if (initData && !initDataLoggedRef.current) {
                        // Best-effort logging; ignore errors to avoid breaking UI
                        api.logInitData(initData).catch(() => { /* no-op */ });
                        initDataLoggedRef.current = true;
                    }
                    
                    refreshAlerts();

                    api.authenticateTelegram(initData).then((authResponse) => {
                        if (authResponse.success && authResponse.user) {
                            setUser({
                                id: authResponse.user.id,
                                first_name: authResponse.user.first_name,
                                last_name: authResponse.user.last_name,
                                username: authResponse.user.username,
                                display_name: [authResponse.user.first_name, authResponse.user.last_name].filter(Boolean).join(' '),
                                photo_url: authResponse.user.photo_url || '',
                                balance: authResponse.user.balance,
                                referral_code: authResponse.user.referral_code,
                                referred_by: authResponse.user.referred_by,
                                refers: authResponse.user.refers,
                                phone_number: authResponse.user.phone_number,
                                phone_verified: authResponse.user.phone_verified,
                            });
                        }
                    }).catch(() => {
                        setUser({
                            id: tgUser.id,
                            first_name: tgUser.first_name,
                            last_name: tgUser.last_name,
                            username: tgUser.username,
                            display_name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '),
                            photo_url: tgUser.photo_url ?? '',
                            balance: 0,
                        });
                    });
                }
            } catch (e) { }
        };
        loadUser();
    }, []);

    // REALTIME STATUS SYNCING (via Server-Sent Events)
    const esRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const initData = getInitDataRaw();
        if (!initData) {
            console.warn('[SSE] No initData available, skipping stream');
            return;
        }

        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;
        let reconnectDelay = 3000; // Start at 3s, exponential backoff
        const MAX_RECONNECT_DELAY = 30000; // Cap at 30s

        function connect() {
            if (cancelled) return;
            // Close any existing connection 
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }

            const url = `${api.NODE_API_URL}/orders/stream?initData=${encodeURIComponent(initData!)}`;
            console.log('[SSE] Connecting to', url);
            const es = new EventSource(url);
            esRef.current = es;

            es.onopen = () => {
                console.log('[SSE] Connected successfully');
                reconnectDelay = 3000; // Reset backoff on successful connection
            };

            es.onmessage = (event) => {
                console.log('[SSE] Received:', event.data);
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'RECONNECT') {
                        // Server asked us to reconnect (timeout)
                        es.close();
                        esRef.current = null;
                        if (!cancelled) {
                            reconnectTimer = setTimeout(connect, 1000);
                        }
                        return;
                    }

                    if (data.type === 'ORDER_PLACED' && data.order) {
                        // Instantly insert the server-verified order into state
                        setOrders(prev => {
                            // Avoid duplicates (optimistic update may already exist)
                            const exists = prev.some(o => String(o.id) === String(data.order.id) || String(o.api_order_id) === String(data.order.api_order_id));
                            if (exists) {
                                // Replace the optimistic entry with real data
                                return prev.map(o =>
                                    (String(o.id) === String(data.order.id) || String(o.api_order_id) === String(data.order.api_order_id))
                                        ? data.order : o
                                );
                            }
                            return [data.order, ...prev];
                        });
                        if (data.new_balance !== undefined) {
                            setBalance(data.new_balance);
                        }
                    }

                    if (data.type === 'ORDER_UPDATED' && data.order) {
                        // Inline-patch the specific order — no full refresh needed
                        setOrders(prev => prev.map(o =>
                            (String(o.id) === String(data.order.id) || String(o.api_order_id) === String(data.order.api_order_id))
                                ? { ...o, status: data.order.status, start_count: data.order.start_count, remains: data.order.remains }
                                : o
                        ));

                        if (data.refunded) {
                            // Refresh balance after refund
                            getInitDataString().then(initStr => {
                                if (initStr) {
                                    api.getBalance(initStr).then(b => {
                                        if (b.success) setBalance(b.balance);
                                    }).catch(() => {});
                                }
                            });

                            Swal.fire({
                                title: 'Order Updated',
                                text: 'An order was refunded. The amount has been credited to your balance!',
                                icon: 'info',
                                confirmButtonColor: '#3498db'
                            });
                        }
                    }
                } catch (e) {
                    console.error('[SSE] Parse error:', e);
                }
            };

            es.onerror = (err) => {
                console.warn(`[SSE] Connection error, will reconnect in ${reconnectDelay / 1000}s`, err);
                es.close();
                esRef.current = null;
                if (!cancelled) {
                    reconnectTimer = setTimeout(connect, reconnectDelay);
                    // Exponential backoff: 3s → 6s → 12s → 24s → 30s (capped)
                    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
                }
            };
        }

        connect();

        return () => {
            cancelled = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
        };
    }, [setBalance]);

    const handleSetActiveTab = useCallback((tab: TabId) => {
        setActiveTab(tab);
        if (isTelegramApp) {
            hapticSelection();
            void cloudSet('last_tab', tab);
        }
    }, [isTelegramApp]);

    const handleSetSelectedPlatform = useCallback((p: SocialPlatform | null) => {
        setSelectedPlatform(p);
        if (p && isTelegramApp) hapticSelection();
    }, [isTelegramApp]);

    const handleSetSelectedService = useCallback((s: Service | null) => {
        setSelectedService(s);
        if (s && isTelegramApp) hapticSelection();
    }, [isTelegramApp]);

    useEffect(() => {
        if (!isTelegramApp) return;
        void (async () => {
            const val = await cloudGet('last_tab');
            if (val && ['order', 'history', 'deposit', 'more'].includes(val)) {
                setActiveTab(val as TabId);
            }
        })();
    }, [isTelegramApp]);

    const value = useMemo<AppContextType>(() => ({
        user,
        isTelegramApp,
        services,
        recommendedIds,
        selectedPlatform,
        selectedCategory,
        selectedService,
        orders,
        deposits,
        alerts,
        rateMultiplier: settings.rateMultiplier,
        adminMargin: (settings as any).adminMargin || settings.rateMultiplier || 1,
        discountPercent: settings.discountPercent,
        holidayName: settings.holidayName,
        maintenanceMode: settings.maintenanceMode,
        userCanOrder: settings.userCanOrder,
        marqueeText: settings.marqueeText,
        botUsername: settings.botUsername,
        activeTab,
        toasts,
        isLoading,
        unreadAlerts,
        isSyncingBalance,
        isSyncingServices,
        isSyncingOrders,
        isSyncingDeposits,
        isSyncingAlerts,
        setUser,
        setActiveTab: handleSetActiveTab,
        setSelectedPlatform: handleSetSelectedPlatform,
        setSelectedCategory,
        setSelectedService: handleSetSelectedService,
        setOrders,
        setDeposits,
        setAlerts,
        setBalance,
        setIsLoading,
        setUnreadAlerts,
        showToast,
        removeToast,
        refreshServices,
        refreshOrders: async () => { await refreshOrders(); },
        refreshDeposits,
        refreshAlerts,
    }), [
        user, isTelegramApp, services, recommendedIds, selectedPlatform,
        selectedCategory, selectedService, orders, deposits, alerts,
        settings, activeTab, toasts, isLoading, unreadAlerts,
        isSyncingBalance, isSyncingServices, isSyncingOrders, isSyncingDeposits, isSyncingAlerts,
        handleSetActiveTab, handleSetSelectedPlatform, handleSetSelectedService,
        showToast, removeToast, refreshServices, refreshOrders, refreshDeposits, refreshAlerts, setBalance
    ]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
