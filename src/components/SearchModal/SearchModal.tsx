import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { List, Section, Input, Placeholder } from '@telegram-apps/telegram-ui';
import type { Service, SocialPlatform } from '../../types';
import { formatETB } from '../../constants';
import { useAllServices } from '../../hooks/useAllServices';
import { useApp } from '../../context/AppContext';
import { TextSkeleton } from '../Skeleton/SkeletonLoader';
import { useModalLock } from '../../hooks/useModalLock';
import { calculatePriceFormula } from '../../utils/priceFormula';

interface Props {
    onClose: () => void;
}

export function SearchModal({ onClose }: Props) {
    useModalLock(onClose);
    const { setSelectedPlatform, setSelectedCategory, setSelectedService, setActiveTab, isSyncingServices, rateMultiplier, adminMargin, discountPercent } = useApp();
    const [search, setSearch] = useState('');
    const { data: services = [], isLoading, isFetching } = useAllServices();
    const showRateSkeleton = isSyncingServices || isFetching;

    const [recentSearches, setRecentSearches] = useState<Service[]>(() => {
        try {
            const saved = localStorage.getItem('primora_recent_searches');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const saveRecentSearch = (service: Service) => {
        try {
            const filtered = recentSearches.filter(s => s.id !== service.id);
            const updated = [service, ...filtered].slice(0, 10);
            setRecentSearches(updated);
            localStorage.setItem('primora_recent_searches', JSON.stringify(updated));
        } catch (err) {
            console.error('Failed to save recent search:', err);
        }
    };

    const handleRemoveRecent = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        const updated = recentSearches.filter(s => s.id !== id);
        setRecentSearches(updated);
        try {
            localStorage.setItem('primora_recent_searches', JSON.stringify(updated));
        } catch (err) {
            console.error('Failed to remove recent search item:', err);
        }
    };

    const handleClearAllRecent = () => {
        setRecentSearches([]);
        try {
            localStorage.removeItem('primora_recent_searches');
        } catch (err) {
            console.error('Failed to clear recent searches:', err);
        }
    };

    const results = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        const terms = q.split(/\s+/);
        return services.filter(s => {
            const haystack = `${s.name} ${s.category} ${s.id}`.toLowerCase();
            return terms.every(t => haystack.includes(t));
        }).slice(0, 30);
    }, [services, search]);

    const grouped = useMemo(() => {
        const map = new Map<string, Service[]>();
        for (const s of results) {
            const arr = map.get(s.category) || [];
            arr.push(s);
            map.set(s.category, arr);
        }
        return map;
    }, [results]);

    const handleSelectSearchResult = (service: Service) => {
        saveRecentSearch(service);

        const textToCheck = (service.category + " " + service.name).toLowerCase();
        
        let network: SocialPlatform = 'other';
        if (textToCheck.includes('youtube') || textToCheck.includes('yt ')) {
            network = 'youtube';
        } else if (textToCheck.includes('tiktok') || textToCheck.includes('tik tok')) {
            network = 'tiktok';
        } else if (textToCheck.includes('telegram') || textToCheck.includes('tg ')) {
            network = 'telegram';
        } else if (textToCheck.includes('instagram') || textToCheck.includes('ig ')) {
            network = 'instagram';
        } else if (textToCheck.includes('twitter') || textToCheck.includes(' x ') || textToCheck.startsWith('x ') || textToCheck.includes('x/')) {
            network = 'twitter';
        } else if (textToCheck.includes('facebook') || textToCheck.includes('fb ')) {
            network = 'facebook';
        } else if (textToCheck.includes('top services') || textToCheck.includes('top ')) {
            network = 'top';
        }

        setSelectedPlatform(network);
        setSelectedCategory(service.category);
        setSelectedService(service);
        setActiveTab('order');
        onClose();
    };

    return createPortal(
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw',
            height: '100dvh',
            backgroundColor: 'var(--tg-theme-bg-color, #1a1a2e)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideUp 0.3s ease-out',
            touchAction: 'none'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                borderBottom: '1px solid var(--tg-theme-hint-color, rgba(255,255,255,0.1))'
            }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>🔍 Search</h2>
                <button 
                    onClick={onClose}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--tg-theme-text-color, #fff)',
                        cursor: 'pointer',
                        padding: '4px'
                    }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingTop: '0px', paddingBottom: '150px', touchAction: 'pan-y' }}>
                <div style={{ padding: '8px 0 12px' }}>
                    <Input
                        inputMode="search"
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                        placeholder="Type name, ID, or category..."
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                        className="modal-search-input"
                    />
                </div>
                <List>
                    {isLoading ? (
                        <Section>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="skeleton-modal-card">
                                    <div className="skeleton-shimmer skeleton-modal-bar-title" />
                                    <div className="skeleton-shimmer skeleton-modal-bar-sub" />
                                </div>
                            ))}
                        </Section>
                    ) : search.trim() === '' ? (
                        recentSearches.length > 0 ? (
                            <Section
                                header={
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                        <span>🕒 Recent Searches</span>
                                        <button
                                            onClick={handleClearAllRecent}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--tg-theme-link-color, #6ab3f3)',
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                padding: '0 4px'
                                            }}
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                }
                            >
                                {recentSearches.map(svc => {
                                    const formula = calculatePriceFormula(svc.rate, svc.original_rate, rateMultiplier, 1000, discountPercent, adminMargin);
                                    return (
                                        <div
                                            key={svc.id}
                                            onClick={() => handleSelectSearchResult(svc)}
                                            style={{
                                                padding: '14px 16px',
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px',
                                                cursor: 'pointer',
                                                WebkitTapHighlightColor: 'transparent',
                                                position: 'relative'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', lineHeight: '1.4', flex: 1 }}>
                                                    <span style={{ marginRight: '6px', fontSize: '13px', opacity: 0.7 }}>🕒</span>
                                                    {svc.name}
                                                </div>
                                                <button
                                                    onClick={(e) => handleRemoveRecent(e, svc.id)}
                                                    title="Remove"
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: 'var(--tg-theme-hint-color, rgba(255,255,255,0.4))',
                                                        fontSize: '14px',
                                                        cursor: 'pointer',
                                                        padding: '2px 4px',
                                                        lineHeight: 1
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                <div style={{
                                                    background: 'rgba(99, 102, 241, 0.18)',
                                                    color: '#818cf8',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    height: 'fit-content',
                                                    marginTop: '2px'
                                                }}>
                                                    #{svc.id}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '13px' }}>🚀</span>
                                                        {showRateSkeleton ? (
                                                            <TextSkeleton width={60} height={14} />
                                                        ) : discountPercent > 0 ? (
                                                            <>
                                                                <span style={{ textDecoration: 'line-through', fontSize: '12px', color: '#64748b' }}>
                                                                    {formatETB(formula.subtotal)}
                                                                </span>
                                                                <span style={{ color: '#00d68f', fontWeight: 800, fontSize: '14px' }}>
                                                                    {formatETB(formula.finalTotal)} <span style={{ fontSize: '12px', color: '#00d68f', opacity: 0.9, fontWeight: 500 }}>/ 1000</span>
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span style={{ color: '#00d68f', fontWeight: 800, fontSize: '14px' }}>
                                                                {formatETB(formula.finalRate)} <span style={{ fontSize: '12px', color: '#00d68f', opacity: 0.9, fontWeight: 500 }}>/ 1000</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
                                                        {discountPercent > 0 && (
                                                            <span style={{
                                                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                                color: '#ffffff',
                                                                fontSize: '10px',
                                                                fontWeight: 800,
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                lineHeight: '1.2'
                                                            }}>
                                                                {discountPercent}% OFF
                                                            </span>
                                                        )}
                                                        {svc.min !== undefined && <span>Min: {svc.min.toLocaleString()}</span>}
                                                        {svc.max !== undefined && <><span>|</span><span>Max: {svc.max.toLocaleString()}</span></>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </Section>
                        ) : (
                            <Placeholder description="Start typing to search" />
                        )
                    ) : results.length === 0 ? (
                        <Placeholder description="No services match your search" />
                    ) : (
                        Array.from(grouped.entries()).map(([category, svcs]) => (
                            <Section key={category} header={category}>
                                {svcs.map(svc => {
                                    const formula = calculatePriceFormula(svc.rate, svc.original_rate, rateMultiplier, 1000, discountPercent, adminMargin);
                                    return (
                                        <div
                                            key={svc.id}
                                            onClick={() => handleSelectSearchResult(svc)}
                                            style={{
                                                padding: '14px 16px',
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px',
                                                cursor: 'pointer',
                                                WebkitTapHighlightColor: 'transparent'
                                            }}
                                        >
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', lineHeight: '1.4' }}>
                                                {svc.name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                <div style={{
                                                    background: 'rgba(99, 102, 241, 0.18)',
                                                    color: '#818cf8',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    height: 'fit-content',
                                                    marginTop: '2px'
                                                }}>
                                                    #{svc.id}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '13px' }}>🚀</span>
                                                        {showRateSkeleton ? (
                                                            <TextSkeleton width={60} height={14} />
                                                        ) : discountPercent > 0 ? (
                                                            <>
                                                                <span style={{ textDecoration: 'line-through', fontSize: '12px', color: '#64748b' }}>
                                                                    {formatETB(formula.subtotal)}
                                                                </span>
                                                                <span style={{ color: '#00d68f', fontWeight: 800, fontSize: '14px' }}>
                                                                    {formatETB(formula.finalTotal)} <span style={{ fontSize: '12px', color: '#00d68f', opacity: 0.9, fontWeight: 500 }}>/ 1000</span>
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span style={{ color: '#00d68f', fontWeight: 800, fontSize: '14px' }}>
                                                                {formatETB(formula.finalRate)} <span style={{ fontSize: '12px', color: '#00d68f', opacity: 0.9, fontWeight: 500 }}>/ 1000</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
                                                        {discountPercent > 0 && (
                                                            <span style={{
                                                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                                color: '#ffffff',
                                                                fontSize: '10px',
                                                                fontWeight: 800,
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                lineHeight: '1.2'
                                                            }}>
                                                                {discountPercent}% OFF
                                                            </span>
                                                        )}
                                                        {svc.min !== undefined && <span>Min: {svc.min.toLocaleString()}</span>}
                                                        {svc.max !== undefined && <><span>|</span><span>Max: {svc.max.toLocaleString()}</span></>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </Section>
                        ))
                    )}
                </List>
                <div className="modal-list-spacer" />
            </div>
        </div>,
        document.body
    );
}