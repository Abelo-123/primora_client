import { useApp } from '../../context/AppContext';
import { BadgeSkeleton } from '../Skeleton/SkeletonLoader';

import { Avatar, Button } from '@telegram-apps/telegram-ui';

interface Props {
    onSearchClick: () => void;
    onNotificationClick: () => void;
}

export function GlobalHeader({ onSearchClick, onNotificationClick }: Props) {
    const { user, unreadAlerts, setActiveTab, isSyncingBalance } = useApp();

    return (
        <div className="global-header">
            <div className="global-header__left">
                <div className="global-header__avatar-wrapper">
                    <div className="global-header__avatar-shield" />
                    <Avatar 
                        size={48} 
                        src={user?.photo_url} 
                        acronym={user?.first_name ? user.first_name[0] : 'P'} 
                        style={{ border: '2px solid rgba(212, 175, 55, 0.6)' }}
                    />
                </div>
                <div className="global-header__info">
                    <div className="global-header__name-row">
                        <span className="global-header__name">{user?.first_name || 'Paxyo'}</span>
                        <span className="global-header__verified-badge" title="Verified User">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#080d19" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </span>
                    </div>
                    <div className="global-header__balance">
                        {isSyncingBalance || user?.balance == null ? (
                            <BadgeSkeleton width={72} height={18} />
                        ) : (
                            `${Number(user.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`
                        )}
                    </div>
                </div>
            </div>
            <button 
                className="global-header__add-funds-btn"
                onClick={() => setActiveTab('deposit')}
            >
                + ADD FUNDS
            </button>
            <div className="global-header__actions">
                <div style={{ position: 'relative' }}>
                    <Button
                        mode="plain"
                        className="global-header__action-btn"
                        onClick={onNotificationClick}
                        style={{ padding: 8 }}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </Button>
                    {unreadAlerts > 0 && (
                        <span className="global-header__badge">
                            {unreadAlerts > 9 ? '9+' : unreadAlerts}
                        </span>
                    )}
                </div>
                <Button
                    mode="plain"
                    className="global-header__action-btn global-header__action-btn--search"
                    onClick={onSearchClick}
                    style={{ padding: 8, color: 'var(--accent-secondary)' }}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </Button>
            </div>
        </div>
    );
}
