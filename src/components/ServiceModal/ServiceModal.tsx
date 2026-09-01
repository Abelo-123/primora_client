import React, { useState, useMemo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { List, Section, Input, Placeholder } from '@telegram-apps/telegram-ui';
import type { Service } from '../../types';
import { formatETB } from '../../constants';
import { useCategoryServices } from '../../hooks/useCategoryServices';
import { useApp } from '../../context/AppContext';
import { TextSkeleton } from '../Skeleton/SkeletonLoader';
import { useModalLock } from '../../hooks/useModalLock';
import { calculatePriceFormula } from '../../utils/priceFormula';

interface Props {
    category: string;
    recommendedIds: number[];
    onSelect: (service: Service) => void;
    onClose: () => void;
}

const BATCH_SIZE = 50;

export function ServiceModal({ category, recommendedIds, onSelect, onClose }: Props) {
    useModalLock(onClose);
    const { isSyncingServices, rateMultiplier, adminMargin } = useApp();
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

    const { data: categoryServices = [], isLoading: loading, isFetching, isError } = useCategoryServices(category, recommendedIds);
    const showRateSkeleton = isSyncingServices || isFetching;

    const filtered = useMemo(() => {
        if (!deferredSearch.trim()) return categoryServices;
        const q = deferredSearch.toLowerCase();
        return categoryServices.filter(s =>
            s.name.toLowerCase().includes(q) || s.id.toString().includes(q)
        );
    }, [categoryServices, deferredSearch]);

    const visibleServices = useMemo(() => {
        return filtered.slice(0, visibleCount);
    }, [filtered, visibleCount]);

    const hasMore = visibleCount < filtered.length;

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (target.scrollHeight - target.scrollTop - target.clientHeight < 200 && hasMore) {
            setVisibleCount(prev => Math.min(prev + BATCH_SIZE, filtered.length));
        }
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
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>⚡ Select Service</h2>
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

            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingTop: '0px', paddingBottom: '150px', touchAction: 'pan-y' }} onScroll={handleScroll}>
                <div style={{ padding: '8px 0 12px' }}>
                    <Input
                        inputMode="search"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Search services..."
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                        className="modal-search-input"
                    />
                </div>
                <List>
                    {loading ? (
                        <Section>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="skeleton-modal-card">
                                    <div className="skeleton-shimmer skeleton-modal-bar-title" />
                                    <div className="skeleton-shimmer skeleton-modal-bar-sub" />
                                </div>
                            ))}
                        </Section>
                    ) : isError ? (
                        <Placeholder description="Failed to load services" />
                    ) : filtered.length === 0 ? (
                        <Placeholder description="No services match your search" />
                    ) : (
                        <Section header={category}>
                            {visibleServices.map(svc => {
                                const formula = calculatePriceFormula(svc.rate, svc.original_rate, rateMultiplier, 1000, 0, adminMargin);
                                return (
                                    <div
                                        key={svc.id}
                                        className="modal-item"
                                        onClick={() => onSelect(svc)}
                                    >
                                        <div className="modal-item-main">
                                            <div className="modal-item-name">{svc.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--accent, #00f5d4)', opacity: 0.9, marginTop: '3px', fontFamily: 'monospace' }}>
                                                🧮 Formula: {formula.perThousandEquation}
                                            </div>
                                        </div>
                                        <div className="modal-item-id">ID: {svc.id}</div>
                                        <div className="modal-item-price">
                                            {showRateSkeleton ? <TextSkeleton width={45} height={12} /> : formatETB(formula.finalRate)} <span style={{ fontSize: '10px', opacity: 0.8 }}>/1000</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </Section>
                    )}
                </List>
                {hasMore && (
                    <div
                        style={{
                            padding: '14px 16px',
                            textAlign: 'center',
                            color: 'var(--tg-theme-link-color, #6ab3f3)',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                        onClick={() => setVisibleCount(prev => Math.min(prev + BATCH_SIZE, filtered.length))}
                    >
                        Load more ({filtered.length - visibleCount} remaining)
                    </div>
                )}
                <div className="modal-list-spacer" />
            </div>
        </div>,
        document.body
    );
}