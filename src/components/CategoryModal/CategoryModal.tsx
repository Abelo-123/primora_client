import React, { useState, useMemo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { List, Section, Input, Placeholder } from '@telegram-apps/telegram-ui';
import type { SocialPlatform } from '../../types';
import { useCategories } from '../../hooks/useCategories';
import { useModalLock } from '../../hooks/useModalLock';

interface Props {
    platform: SocialPlatform;
    onSelect: (category: string) => void;
    onClose: () => void;
}

export function CategoryModal({ platform, onSelect, onClose }: Props) {
    useModalLock(onClose);
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const { data: rawCategories = [], isLoading: loading } = useCategories(platform);

    const categories = useMemo(() => {
        if (platform === 'top') return ['Top Services'];
        return rawCategories;
    }, [rawCategories, platform]);

    const filtered = useMemo(() => {
        if (!deferredSearch.trim()) return categories;
        const q = deferredSearch.toLowerCase();
        return categories.filter(c => c.toLowerCase().includes(q));
    }, [categories, deferredSearch]);

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
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>🏷️ Select Category</h2>
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
                        placeholder="Search categories..."
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                        className="modal-search-input"
                    />
                </div>
                <List>
                    {loading && categories.length === 0 ? (
                        <Section>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="skeleton-modal-card">
                                    <div className="skeleton-shimmer skeleton-modal-bar-title" />
                                    <div className="skeleton-shimmer skeleton-modal-bar-sub" />
                                </div>
                            ))}
                        </Section>
                    ) : filtered.length === 0 ? (
                        <Placeholder description="No categories match your search" />
                    ) : (
                        <Section header={`${platform.toUpperCase()} CATEGORIES`}>
                            {filtered.map(cat => (
                                <div
                                    key={cat}
                                    className="modal-item"
                                    onClick={() => onSelect(cat)}
                                >
                                    <div className="modal-item-main">
                                        <div className="modal-item-name">{cat}</div>
                                    </div>
                                </div>
                            ))}
                        </Section>
                    )}
                </List>
                <div className="modal-list-spacer" />
            </div>
        </div>,
        document.body
    );
}
