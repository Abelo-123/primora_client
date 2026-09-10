import { AppRoot } from '@telegram-apps/telegram-ui';
import { AppProvider, useApp } from '../context/AppContext';
import { BottomNav } from './BottomNav/BottomNav';
import { NODE_API_URL } from '../api';
import { ToastContainer } from './Toast/Toast';
import { LoadingOverlay } from './LoadingOverlay/LoadingOverlay';
import { useEffect, useRef, useMemo, useState } from 'react';
import { GlobalHeader } from './GlobalHeader/GlobalHeader';
import { SearchModal } from './SearchModal/SearchModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  showBackButton,
  hideBackButton,
  onBackButtonClick,
  onSettingsButtonClick,
  retrieveLaunchParams,
  isMiniAppDark,
} from '@telegram-apps/sdk-react';
import { hapticSelection } from '../helpers/telegram';
import { NotificationPanel } from './NotificationPanel/NotificationPanel';

import { OrderPage } from '../pages/OrderPage/OrderPage';
import { HistoryPage } from '../pages/HistoryPage/HistoryPage';
import { DepositPage } from '../pages/DepositPage/DepositPage';
import { MorePage } from '../pages/MorePage/MorePage';





function AppContent() {
  const { activeTab, setActiveTab, isLoading, maintenanceMode } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Telegram scroll fix: prevent swipe-to-close
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleTouchStart = () => {
      if (el.scrollTop === 0) {
        el.scrollTop = 1;
      }
    };
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => el.removeEventListener('touchstart', handleTouchStart);
  }, []);

  // Combined SDK setups & Pre-fetching
  useEffect(() => {
    try {
        const twa = (window as any).Telegram?.WebApp;
        if (twa) {
            twa.expand();
            twa.setHeaderColor('secondary_bg_color');
            twa.setBackgroundColor('secondary_bg_color');
        }
    } catch (e) {
        console.log('Telegram SDK Color setup failed', e);
    }

    // Silent background warm-up & periodic keep-alive ping to prevent Render cold starts
    const pingWake = () => {
      fetch(`${NODE_API_URL}/app/wake`).catch(() => {});
    };
    pingWake();
    const keepAliveInterval = setInterval(pingWake, 5 * 60 * 1000); // Keep-alive every 5 min

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pingWake();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(keepAliveInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Combined Back Button logic for Modals and Tabs
  useEffect(() => {
    const isSubViewOpen = showSearch || showNotifications;

    if (isSubViewOpen || activeTab !== 'order') {
      try { showBackButton(); } catch { /* ignore */ }
      
      const off = onBackButtonClick(() => {
        if (showSearch) {
          setShowSearch(false);
        } else if (showNotifications) {
          setShowNotifications(false);
        } else {
          setActiveTab('order');
        }
      });
      
      return () => {
        off();
        try { hideBackButton(); } catch { /* ignore */ }
      };
    } else {
      try { hideBackButton(); } catch { /* ignore */ }
    }
  }, [activeTab, setActiveTab, showSearch, showNotifications]);

  // Settings button via SDK
  useEffect(() => {
    try {
      const off = onSettingsButtonClick(() => {
        setActiveTab('more');
        hapticSelection();
      });
      return () => off();
    } catch { /* ignore */ }
  }, [setActiveTab]);

  // Check for maintenance mode
  if (maintenanceMode) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: 40, 
        textAlign: 'center',
        background: '#0a0a12',
        color: '#e4e4e7'
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔧</div>
        <h2 style={{ marginBottom: 8 }}>Maintenance Mode</h2>
        <p style={{ color: '#71717a' }}>We are currently performing maintenance. Please check back soon.</p>
      </div>
    );
  }

  return (
    <>
      <div className="scroll-wrapper" ref={scrollRef}>
        <GlobalHeader 
          onSearchClick={() => setShowSearch(true)}
          onNotificationClick={() => setShowNotifications(true)}
        />
        {activeTab === 'order' && <OrderPage />}
        {activeTab === 'history' && <HistoryPage />}
        {activeTab === 'deposit' && <DepositPage />}
        {activeTab === 'more' && <MorePage />}
      </div>
      <BottomNav />
      {showSearch && (
        <SearchModal 
          onClose={() => setShowSearch(false)}
        />
      )}
      {showNotifications && (
        <NotificationPanel onBack={() => setShowNotifications(false)} />
      )}
      <ToastContainer />
      <LoadingOverlay visible={isLoading} />
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000,    // 10 minutes
      retry: 2,
    },
  },
});

export function App() {
  const lp = useMemo(() => retrieveLaunchParams(), []);
  
  // Cache the Telegram launch params in sessionStorage so close-popup.html can retrieve them and reload the app inside the WebView.
  useEffect(() => {
    try {
      const launchParams = window.location.search + window.location.hash;
      if (launchParams.includes('tgWebAppData')) {
        sessionStorage.setItem('primora:launch_params', launchParams);
      }
    } catch (e) {
      console.error('Failed to cache launch params:', e);
    }
  }, []);

  const [themeOverride] = useState<'auto' | 'light' | 'dark'>(
    (localStorage.getItem('app-theme') as any) || 'auto'
  );

  const isSystemDark = isMiniAppDark();
  const activeAppearance = themeOverride === 'auto' 
    ? (isSystemDark ? 'dark' : 'light') 
    : themeOverride;

  // Sync background to body so the whole frame changes color
  useEffect(() => {
    document.body.style.backgroundColor = activeAppearance === 'dark' ? '#000000' : '#ffffff';
    document.body.style.color = activeAppearance === 'dark' ? '#ffffff' : '#000000';
    
    // Also sync with Telegram SDK for native theme matching
    import('../helpers/telegram').then(m => {
      m.setBackgroundColor(activeAppearance === 'dark' ? '#000000' : '#ffffff');
      m.setHeaderColor(activeAppearance === 'dark' ? '#000000' : '#ffffff');
      m.setTheme(themeOverride === 'auto' ? 'system' : themeOverride === 'dark' ? 'dark' : 'light');
    });
  }, [activeAppearance, themeOverride]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <AppRoot
          appearance={activeAppearance}
          platform={['macos', 'ios'].includes(lp.tgWebAppPlatform) ? 'ios' : 'base'}
        >
          <AppContent />
        </AppRoot>
      </AppProvider>
    </QueryClientProvider>
  );
}
