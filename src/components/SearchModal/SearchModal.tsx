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
    const { setSelectedPlatform, setSelectedCategory, setSelectedService, setActiveTab, isSyncingServices, rateMultiplier, adminMargin } = useApp();
    const [search, setSearch] = useState('');
    const { data: services = [], isLoading, isFetching } = useAllServices();
    const showRateSkeleton = isSyncingServices || isFetching;

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
                        <Placeholder description="Start typing to search" />
                    ) : results.length === 0 ? (
                        <Placeholder description="No services match your search" />
                    ) : (
                        Array.from(grouped.entries()).map(([category, svcs]) => (
                            <Section key={category} header={category}>
                                {svcs.map(svc => {
                                    const formula = calculatePriceFormula(svc.rate, svc.original_rate, rateMultiplier, 1000, 0, adminMargin);
                                    return (
                                        <div
                                            key={svc.id}
                                            className="modal-item"
                                            onClick={() => handleSelectSearchResult(svc)}
                                        >
                                            <div className="modal-item-main">
                                                <div className="modal-item-name">{svc.name}</div>
                                            </div>
                                            <div className="modal-item-id">ID: {svc.id}</div>
                                            <div className="modal-item-price">
                                                {showRateSkeleton ? <TextSkeleton width={45} height={12} /> : formatETB(formula.finalRate)} <span style={{ fontSize: '10px', opacity: 0.8 }}>/1000</span>
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