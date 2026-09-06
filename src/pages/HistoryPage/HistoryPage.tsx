import { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { useApp } from '../../context/AppContext';
import { TableRowSkeleton } from '../../components/Skeleton/SkeletonLoader';
import { hapticImpact, hapticSelection } from '../../helpers/telegram';
import { Button, Input } from '@telegram-apps/telegram-ui';
import type { OrderStatus } from '../../types';

const STATUS_FILTERS: { id: OrderStatus | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'processing', label: 'Processing' },
    { id: 'completed', label: 'Completed' },
];

function normalizeStatus(status: string): OrderStatus {
    const s = status.toLowerCase();
    if (s === 'in_progress') return 'processing';
    if (s === 'canceled') return 'cancelled';
    return s as OrderStatus;
}

function TruncatedLink({ link }: { link: string }) {
    const [expanded, setExpanded] = useState(false);

    if (!link) return null;

    const href = link.startsWith('http') || link.startsWith('t.me') || link.startsWith('@')
        ? (link.startsWith('@') ? `https://t.me/${link.slice(1)}` : link)
        : `https://${link}`;

    const MAX_LEN = 25;
    const isLong = link.length > MAX_LEN;

    return (
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', maxWidth: '100%', wordBreak: 'break-all' }}>
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="service-link-text"
                style={{
                    color: 'var(--tg-theme-link-color, #6ab3f3)',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    wordBreak: 'break-all',
                    fontSize: '12px'
                }}
            >
                {expanded || !isLong ? link : `${link.slice(0, MAX_LEN)}...`}
            </a>
            {isLong && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(!expanded);
                    }}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--tg-theme-link-color, #6ab3f3)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '0 2px',
                        textDecoration: 'none',
                        lineHeight: 1
                    }}
                >
                    {expanded ? 'See Less' : 'See More'}
                </button>
            )}
        </div>
    );
}

export function HistoryPage() {
    const { orders, showToast, refreshOrders, setActiveTab, isSyncingOrders } = useApp();
    const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const [showSearch, setShowSearch] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const filtered = useMemo(() => {
        let result = orders;

        if (filter !== 'all') {
            result = result.filter(o => normalizeStatus(o.status) === filter);
        }

        if (deferredSearch.trim()) {
            const q = deferredSearch.toLowerCase();
            result = result.filter(o =>
                (o.service_name || '').toLowerCase().includes(q) ||
                (o.api_order_id || '').toString().includes(q) ||
                (o.link || '').toLowerCase().includes(q)
            );
        }

        return result;
    }, [orders, filter, deferredSearch]);

    const handleRefresh = useCallback(() => {
        hapticImpact('medium');
        setIsRefreshing(true);
        refreshOrders();
        showToast('info', 'Refreshing orders...');

        setTimeout(() => setIsRefreshing(false), 600);
    }, [refreshOrders, showToast]);

    const handleCancelOrder = useCallback(async (orderId: string | number) => {
        hapticImpact('medium');
        if (!window.confirm(`Are you sure you want to request cancellation for Order #${orderId}?`)) return;

        try {
            const initData = window.Telegram?.WebApp?.initData || '';
            const res = await fetch(`${import.meta.env.VITE_NODE_API_URL || 'https://paxyoback.infinityfreeapp.com'}/cancel-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, initData }),
            });
            const data = await res.json();

            if (data.success) {
                showToast('success', 'Order cancelled successfully.');
                refreshOrders();
            } else {
                showToast('error', data.error || 'Failed to cancel order via API.');
            }
        } catch (e) {
            showToast('error', 'Network error while cancelling.');
        }
    }, [refreshOrders, showToast]);

    return (
        <div className="history-page">
            <div className="history-filter-row" style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: 'var(--tg-theme-bg-color)',
                backgroundColor: 'rgba(var(--tg-theme-bg-color), 0.8)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                paddingTop: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--tg-theme-secondary-bg-color)',
                margin: '0 -16px 16px -16px',
                paddingLeft: '16px',
                paddingRight: '16px'
            }}>
                <div
                    className="filter-row"
                    style={{
                        display: 'flex',
                        gap: '8px',
                        overflowX: 'auto',
                        flex: 1,
                        paddingRight: '8px',
                        scrollbarWidth: 'none',
                    }}
                >
                    {STATUS_FILTERS.map(f => (
                        <Button
                            key={f.id}
                            size="s"
                            mode={filter === f.id ? 'filled' : 'outline'}
                            onClick={() => {
                                hapticSelection();
                                setFilter(f.id);
                            }}
                            style={{
                                flexShrink: 0,
                                whiteSpace: 'nowrap',
                                ...(filter === f.id ? { background: 'var(--accent-primary)', color: '#fff', border: 'none' } : {})
                            }}
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>
                <div className="history-actions">
                    <Button
                        mode="plain"
                        onClick={() => setShowSearch(!showSearch)}
                        style={{ padding: 8 }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </Button>
                    <Button
                        mode="plain"
                        onClick={handleRefresh}
                        style={{ padding: 8 }}
                    >
                        <svg
                            className={isRefreshing ? 'spin-animation' : ''}
                            width="18" height="18" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                    </Button>
                </div>
            </div>

            {showSearch && (
                <div style={{ margin: '0 16px 12px' }}>
                    <Input
                        inputMode="search"
                        autoComplete="off"
                        spellCheck={false}
                        type="text"
                        placeholder="Search by order ID, service name, or link..."
                        value={search}
                        onChange={(e: any) => setSearch(e.target.value)}
                        autoFocus
                        after={
                            search.length > 0 ? (
                                <div
                                    onClick={() => setSearch('')}
                                    style={{ padding: '0 8px', color: 'var(--tg-theme-hint-color)', cursor: 'pointer' }}
                                >
                                    ✕
                                </div>
                            ) : null
                        }
                    />
                </div>
            )}

            <div className="history-table-wrapper">
                {isSyncingOrders && filtered.length === 0 ? (
                    <div style={{ padding: '16px' }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <TableRowSkeleton key={i} />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__icon">📦</div>
                        <div className="empty-state__title">No Orders Found</div>
                        {(!search.trim() && filter === 'all') && (
                            <Button size="m" style={{ marginTop: '16px', background: 'var(--accent-primary)', color: '#fff' }} onClick={() => setActiveTab('order')}>
                                Place an Order
                            </Button>
                        )}
                    </div>
                ) : (
                    <table className="history-table-new">
                        <thead>
                            <tr>
                                <th>ORDER ID</th>
                                <th>SERVICE / LINK</th>
                                <th className="col-center">QTY</th>
                                <th className="col-center">START</th>
                                <th className="col-center">REMAINS</th>
                                <th className="col-center">CHARGE</th>
                                <th>DATE</th>
                                <th>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(order => {
                                const status = normalizeStatus(order.status);
                                const isCancellable = status === 'pending' || status === 'processing';

                                return (
                                    <tr key={order.id}>
                                        <td className="col-id"
                                            onClick={() => {
                                                navigator.clipboard.writeText(order.api_order_id.toString());
                                                showToast('success', 'ID copied!');
                                                hapticImpact('light');
                                            }}
                                            style={{ cursor: 'pointer', background: 'rgba(124, 92, 252, 0.05)', borderRadius: '8px' }}
                                        >
                                            <span className="order-id-text" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <i className="fa fa-copy" style={{ fontSize: '12px', opacity: 0.6 }}></i>
                                                #{order.api_order_id}
                                            </span>
                                            <span className={`status-badge status-${status}`}>{status.toUpperCase()}</span>
                                        </td>
                                        <td className="col-service">
                                            <div className="service-name-text">#{order.service_id} {order.service_name}</div>
                                            <TruncatedLink link={order.link} />
                                            {order.custom_fields && Array.isArray(order.custom_fields) && order.custom_fields.length > 0 && (
                                                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {order.custom_fields.map((cf, i) => (
                                                        <div key={i} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: '6px', color: 'var(--tg-theme-hint-color)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                            <strong style={{ color: 'var(--tg-theme-text-color)', textTransform: 'capitalize' }}>{cf.type}:</strong> {cf.value}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="col-center">{order.quantity}</td>
                                        <td className="col-center">{order.start_count || 0}</td>
                                        <td className="col-center">{order.remains || 0}</td>
                                        <td className="col-charge">
                                            <div className="charge-amount">{Number(order.charge || 0).toFixed(4)}</div>
                                            <div className="charge-currency">ETB</div>
                                        </td>
                                        <td className="col-date">
                                            {new Date(order.created_at).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="col-action">
                                            {isCancellable ? (
                                                <button className="cancel-btn" onClick={() => handleCancelOrder(order.api_order_id)}>Cancel</button>
                                            ) : (
                                                <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: '12px' }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}