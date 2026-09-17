import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

import { useApp } from '../../context/AppContext';
import { TableRowSkeleton } from '../../components/Skeleton/SkeletonLoader';
import { formatETB } from '../../constants';
import {
    showMainButton,
    hideMainButton,
    onMainButtonClick,
    configureMainButton,
    hapticSelection,
    hapticImpact,
    hapticNotification,
    getInitDataString,
    getTelegramBotId,
    openLink
} from '../../helpers/telegram';
import { Button } from '@telegram-apps/telegram-ui';
import './DepositPage.css';


const PRESET_AMOUNTS = [10, 100, 1000, 10000];
const NODE_API_URL = import.meta.env.VITE_NODE_API_URL || 'https://paxyoback.infinityfreeapp.com';

type DepositStep = 'amount' | 'verifying' | 'success' | 'error';

export function DepositPage() {
    const { user, deposits, setBalance, refreshDeposits, showToast, botUsername, isSyncingDeposits } = useApp();
    const [amount, setAmount] = useState('');
    const [step, setStep] = useState<DepositStep>('amount');
    const [errorMessage, setErrorMessage] = useState('');
    const [timeLeft, setTimeLeft] = useState(45);
    const timerRef = useRef<any>(null);

    // Use refs for polling state to avoid stale closure issues
    const pollAbortRef = useRef(false);
    const activeTxRefRef = useRef<string | null>(null);
    const recentDepositsRef = useRef<HTMLDivElement>(null);
    const [checkoutUrl, setCheckoutUrl] = useState('');

    const balance = user?.balance ?? 0;

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // ─── Verify deposit with retry (uses refs to avoid stale closures) ───
    const verifyDeposit = useCallback(async (txRef: string) => {
        if (!txRef) return;

        // Save ref and switch UI
        activeTxRefRef.current = txRef;
        pollAbortRef.current = false;
        setStep('verifying');

        // Start countdown timer (45 seconds)
        setTimeLeft(45);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        // Mobile money can take a minute. Poll in intervals.
        const delays = [
            2000, 2000, 2000, 3000, 3000, // First 12s
            4000, 4000, 5000, 5000, 5000, // Next 23s
            8000, 8000, 10000, 10000,     // Slower polling up to 1.5m
            15000, 15000, 20000, 20000,   // up to 3m
            30000, 30000, 30000           // up to 5m max
        ];

        for (let attempt = 0; attempt < delays.length; attempt++) {
            // Check abort flag
            if (pollAbortRef.current || activeTxRefRef.current !== txRef) {
                console.log('[verify] Polling aborted');
                if (timerRef.current) clearInterval(timerRef.current);
                return;
            }

            // Wait before each poll
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));

            // Recheck abort after waiting
            if (pollAbortRef.current || activeTxRefRef.current !== txRef) {
                console.log('[verify] Polling aborted after delay');
                if (timerRef.current) clearInterval(timerRef.current);
                return;
            }

            try {
                const initData = await getInitDataString();
                const userId = user?.id || 'unauth_local_user';
                // Add timestamp to prevent browser caching
                const res = await fetch(`${NODE_API_URL}/verify-deposit?t=${Date.now()}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tx_ref: txRef, initData, user_id: userId, bot_id: getTelegramBotId() || '' }),
                });
                const data = await res.json();
                console.log(`[verify] Attempt ${attempt + 1}/${delays.length} result:`, data);

                if (data.success && data.new_balance !== undefined) {
                    // Payment confirmed!
                    if (timerRef.current) clearInterval(timerRef.current);
                    setBalance(data.new_balance);
                    showToast('success', `Deposit confirmed! Balance: ${formatETB(data.new_balance)}`);
                    hapticNotification('success');
                    setStep('success');
                    activeTxRefRef.current = null;
                    refreshDeposits().catch(() => { });

                    // First-time deposit guidance
                    const isFirstDeposit = !localStorage.getItem('hasDeposited');
                    if (isFirstDeposit) {
                        localStorage.setItem('hasDeposited', 'true');
                    }

                    // Automatically scroll to deposit history after deposit success
                    setTimeout(() => {
                        if (recentDepositsRef.current) {
                            recentDepositsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 800);
                    return;
                }

                // If already completed (from another session), also show success
                if (data.already_completed && data.new_balance !== undefined) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setBalance(data.new_balance);
                    showToast('success', `Deposit already confirmed!`);
                    setStep('success');
                    activeTxRefRef.current = null;
                    refreshDeposits().catch(() => { });

                    const isFirstDeposit = !localStorage.getItem('hasDeposited');
                    if (isFirstDeposit) {
                        localStorage.setItem('hasDeposited', 'true');
                    }

                    setTimeout(() => {
                        if (recentDepositsRef.current) {
                            recentDepositsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 800);
                    return;
                }

                const statusStr = String(data.chapa_status || '').toLowerCase();
                const isFailed = statusStr === 'failed' || statusStr.includes('reject') || statusStr.includes('cancel');
                const isConfigError = statusStr === 'error';

                if (isFailed || isConfigError) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setStep('error');
                    activeTxRefRef.current = null;

                    let declinedReason = data.bank_message || data.message || 'Payment method rejected the prompt';
                    if (declinedReason.toLowerCase().includes('fetched successfully') || declinedReason.toLowerCase().includes('not completed')) {
                        declinedReason = isConfigError ? 'Server configuration error.' : 'Payment was failed or cancelled.';
                    }

                    setErrorMessage(declinedReason);
                    showToast('error', isConfigError ? 'Configuration Error' : 'Payment Declined');
                    hapticNotification('error');
                    refreshDeposits().catch(() => { });
                    return; // Stop polling
                }

                // Otherwise continue polling
                const elapsed = delays.slice(0, attempt + 1).reduce((a, b) => a + b, 0);
                const elapsedSec = Math.round(elapsed / 1000);
                console.log(`[verify] Still pending after ~${elapsedSec}s (attempt ${attempt + 1}/${delays.length})`);
            } catch (err) {
                console.error(`[verify] Network error on attempt ${attempt + 1}:`, err);
            }
        }

        // Exhausted all retries
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(0);
        showToast('info', 'Your payment is being processed. Balance will update automatically.');
        setStep('success');
    }, [setBalance, showToast, refreshDeposits, user]);

    // ─── Refresh deposits & check return tx_ref on mount ────
    useEffect(() => {
        refreshDeposits().catch(() => { });

        // Auto-detect returning from Chapa checkout redirect
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const txRefFromUrl = urlParams.get('tx_ref') || sessionStorage.getItem('pending_tx_ref');

            if (txRefFromUrl) {
                sessionStorage.removeItem('pending_tx_ref');
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
                verifyDeposit(txRefFromUrl);
            }
        } catch (e) { }
    }, [refreshDeposits, verifyDeposit]);

    // ─── Start Redirect Payment (Modal/Overlay Link) ─────────
    const startRedirectPayment = useCallback(async (depositAmount: number) => {
        hapticImpact('medium');
        showToast('info', 'Opening secure checkout...');

        try {
            const initData = await getInitDataString();
            const userId = user?.id || 'unauth_local_user';
            const botId = getTelegramBotId() || '';

            // Direct return URL pointing back to main Primora Mini App
            const returnUrlObj = new URL(window.location.href);
            returnUrlObj.searchParams.set('deposit_success', 'true');
            const returnUrl = returnUrlObj.href;

            const backendRes = await fetch(`${NODE_API_URL}/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: depositAmount,
                    initData,
                    user_id: userId,
                    return_url: returnUrl,
                    bot_id: botId
                }),
            });
            const backendData = await backendRes.json();

            if (backendData.success && backendData.checkout_url) {
                setCheckoutUrl(backendData.checkout_url);

                if (backendData.tx_ref) {
                    try {
                        sessionStorage.setItem('pending_tx_ref', backendData.tx_ref);
                    } catch (e) { }
                }

                showToast('success', 'Redirecting to secure checkout...');
                
                // Navigate directly in current window so return URL lands straight back on the Mini App
                window.location.href = backendData.checkout_url;
            } else {
                let errorMsg = 'Failed to initialize redirect payment';
                if (backendData.error) {
                    errorMsg = typeof backendData.error === 'string' 
                        ? backendData.error 
                        : JSON.stringify(backendData.error);
                }
                showToast('error', errorMsg);
            }
        } catch (err) {
            console.error('[deposit] Error starting payment:', err);
            showToast('error', 'Network error. Please try again.');
        }
    }, [user, showToast, verifyDeposit, botUsername]);

    // ─── Handle Deposit Button Click ─────────────────────────
    const handleDeposit = useCallback(() => {
        const val = parseFloat(amount);

        // Basic validation
        if (!amount || amount.trim() === '') {
            showToast('error', 'Action Required: Please enter an amount');
            return hapticNotification('error');
        }
        if (isNaN(val)) {
            showToast('error', 'Action Required: Amount must be a valid number');
            return hapticNotification('error');
        }
        if (val < 10) {
            showToast('error', 'Action Required: Minimum deposit is 10 ETB');
            return hapticNotification('error');
        }
        if (val > 50000) {
            showToast('error', 'Action Required: Maximum deposit is 50,000 ETB');
            return hapticNotification('error');
        }

        setErrorMessage('');
        startRedirectPayment(val);
    }, [amount, startRedirectPayment, showToast]);

    // ─── Native Main Button Integration ──────────────────────
    useEffect(() => {
        // Only show the native button if we are on the amount entry step
        if (step === 'amount') {
            const val = parseFloat(amount);
            const isValid = val >= 10;

            configureMainButton({
                text: isValid ? `DEPOSIT ${val} ETB` : 'ENTER AMOUNT (MIN 10)',
                color: isValid ? '#007AFF' : '#2d2d2d',
                textColor: '#ffffff',
                isEnabled: isValid,
                isLoaderVisible: false
            });

            showMainButton();

            // Handle the native click
            const off = onMainButtonClick(() => {
                if (isValid) {
                    handleDeposit();
                }
            });

            return () => {
                off();
                hideMainButton();
            };
        } else {
            hideMainButton();
        }
    }, [step, amount, handleDeposit]);

    const recentDeposits = useMemo(() => deposits.slice(0, 5), [deposits]);

    const formatBalanceDisplay = (bal: number) => {
        const parts = bal.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).split('.');
        return { whole: parts[0], decimal: '.' + (parts[1] || '00') };
    };

    const balDisplay = formatBalanceDisplay(balance);

    return (
        <div className="deposit-page-wrapper">
            {/* ─── Hero Balance Card ─── */}
            <div className="deposit-hero deposit-hero--dark">
                <div className="deposit-hero__label">Current Balance</div>
                <div className="deposit-hero__amount">
                    {balDisplay.whole}
                    <span style={{ fontSize: '0.6em', opacity: 0.7 }}>{balDisplay.decimal}</span>
                    <span className="deposit-hero__currency">ETB</span>
                </div>
            </div>

            {/* ─── Amount Input Section ─── */}
            {step === 'amount' && (
                <>
                    <div className="primora-section-header">
                        <span>AMOUNT TO ADD</span>
                    </div>
                    <div className="deposit-input-group">
                        <span className="deposit-input-group__prefix">ETB</span>
                        <input
                            className="deposit-input-group__input"
                            inputMode="numeric"
                            type="text"
                            placeholder="0"
                            value={amount}
                            onChange={(e) => {
                                const rawValue = e.target.value.replace(/[^0-9]/g, '');
                                if (!rawValue) {
                                    setAmount('');
                                    return;
                                }
                                const num = parseInt(rawValue, 10);
                                if (num > 100000) return; // Max limit
                                setAmount(num.toString());
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--tg-theme-text-color)',
                                fontSize: '24px',
                                fontWeight: 'bold',
                                width: '100%',
                                outline: 'none',
                                paddingLeft: '8px'
                            }}
                        />
                    </div>

                    <div className="preset-grid">
                        {PRESET_AMOUNTS.map(amt => (
                            <Button
                                key={amt}
                                mode="plain"
                                className={`preset-btn${amount === String(amt) ? ' preset-btn--active' : ''}`}
                                onClick={() => {
                                    hapticSelection();
                                    const currentVal = parseInt(amount || '0', 10);
                                    const newVal = currentVal + amt;
                                    setAmount(String(newVal > 100000 ? 100000 : newVal));
                                }}
                            >
                                +{amt >= 1000 ? `${amt / 1000}k` : amt}
                            </Button>
                        ))}
                    </div>

                    {errorMessage && (
                        <div className="deposit-error">
                            <span>⚠️</span> {errorMessage}
                        </div>
                    )}

                    {/* DEPOSIT BUTTON */}
                    <div style={{ padding: '16px', marginTop: '8px' }}>
                        <Button
                            size="l"
                            stretched
                            onClick={handleDeposit}
                            disabled={!amount || parseFloat(amount) < 10}
                            style={{
                                background: 'var(--tg-theme-button-color)',
                                color: 'var(--tg-theme-button-text-color)',
                                fontWeight: 600,
                                fontSize: '16px',
                                padding: '14px'
                            }}
                        >
                            Deposit {amount ? `${amount} ETB` : ''}
                        </Button>
                    </div>

                    <div className="deposit-secured">
                        <span className="deposit-secured__lock">🔒</span>
                        Secured by Chapa
                    </div>
                </>
            )}

            {/* ─── Verifying State (Awaiting PIN) ─── */}
            {step === 'verifying' && (
                <div className="deposit-processing" style={{ padding: '24px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                        <div style={{ position: 'relative', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="deposit-processing__spinner"></div>
                            <span style={{ fontSize: '20px', position: 'absolute', animation: 'pulse 1.5s infinite' }}>📱</span>
                        </div>
                    </div>

                    <div className="deposit-processing__text" style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--tg-theme-text-color)', marginBottom: '8px' }}>
                        Awaiting Payment Verification
                    </div>
                    <div className="deposit-processing__subtext" style={{ fontSize: '14px', color: 'var(--tg-theme-hint-color)', lineHeight: '1.5', marginBottom: '20px' }}>
                        Please complete your payment in the mobile wallet prompt. <br />
                        Enter your <b>PIN</b> when prompted to authorize the transaction.
                    </div>

                    <div style={{ width: '100%', height: '8px', background: 'var(--tg-theme-secondary-bg-color)', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                        <div style={{
                            height: '100%',
                            width: `${(timeLeft / 45) * 100}%`,
                            background: 'linear-gradient(90deg, #FFB900 0%, #FF8000 100%)',
                            transition: 'width 1s linear',
                            borderRadius: '4px'
                        }}></div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--tg-theme-hint-color)', marginBottom: '24px' }}>
                        <span>{timeLeft > 0 ? `Checking status (${timeLeft}s)...` : 'Polling for confirmation...'}</span>
                        <span style={{ color: 'var(--tg-theme-button-color)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--tg-theme-button-color)', display: 'inline-block', animation: 'pulse 1s infinite' }}></span>
                            Live Checking
                        </span>
                    </div>

                    {checkoutUrl && (
                        <button
                            onClick={() => openLink(checkoutUrl)}
                            className="deposit-processing__subtext"
                            style={{ display: 'block', margin: '0 auto 20px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', color: 'var(--tg-theme-button-color)', textDecoration: 'underline' }}
                        >
                            Didn't open? Click here to pay
                        </button>
                    )}

                    <div className="deposit-processing__actions" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Button
                            mode="bezeled"
                            stretched
                            size="l"
                            onClick={() => {
                                if (activeTxRefRef.current) {
                                    verifyDeposit(activeTxRefRef.current);
                                }
                            }}
                            style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)' }}
                        >
                            🔄 Re-Check Balance Now
                        </Button>

                        <Button
                            mode="plain"
                            stretched
                            onClick={() => {
                                pollAbortRef.current = true;
                                activeTxRefRef.current = null;
                                if (timerRef.current) clearInterval(timerRef.current);
                                setStep('amount');
                            }}
                            style={{ opacity: 0.7 }}
                        >
                            Cancel / Wait in Background
                        </Button>
                    </div>
                </div>
            )}

            {/* ─── Error State (Payment Failed/Declined) ─── */}
            {step === 'error' && (
                <div className="deposit-error-state" style={{ padding: '24px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            background: 'rgba(255, 71, 87, 0.1)',
                            border: '1px solid rgba(255, 71, 87, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px'
                        }}>
                            ❌
                        </div>
                    </div>

                    <h4 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--tg-theme-text-color)', marginBottom: '8px' }}>
                        Payment Failed/Declined
                    </h4>
                    <p style={{ fontSize: '14px', color: 'var(--tg-theme-hint-color)', lineHeight: '1.5', marginBottom: '24px' }}>
                        {errorMessage || 'The transaction was declined or failed on your mobile wallet.'}
                    </p>

                    <Button
                        size="l"
                        stretched
                        onClick={() => {
                            setStep('amount');
                            setErrorMessage('');
                        }}
                        style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)' }}
                    >
                        Try Again
                    </Button>
                </div>
            )}

            {/* ─── Success State ─── */}
            {step === 'success' && (
                <div className="deposit-success">
                    <div className="deposit-success__icon">✅</div>
                    <div className="deposit-success__text">Deposit Successful!</div>
                    <div className="deposit-success__subtext">Your balance has been updated.</div>

                    {activeTxRefRef.current && (
                        <Button
                            mode="outline"
                            className="deposit-fallback-btn"
                            style={{ marginBottom: 16 }}
                            onClick={() => {
                                if (activeTxRefRef.current) {
                                    verifyDeposit(activeTxRefRef.current);
                                }
                            }}
                        >
                            🔄 Balance not updated? Tap to re-check
                        </Button>
                    )}

                    <Button
                        size="l"
                        stretched
                        style={{ marginTop: 24 }}
                        onClick={() => {
                            setStep('amount');
                            setAmount('');
                            activeTxRefRef.current = null;
                        }}
                    >
                        Make Another Deposit
                    </Button>
                </div>
            )}

            {/* ─── Recent Deposits ─── */}
            <div ref={recentDepositsRef} className="primora-section-header" style={{ marginTop: 24 }}>Recent Deposits</div>
            {isSyncingDeposits && recentDeposits.length === 0 ? (
                <div style={{ padding: '0 16px' }}>
                    {[1, 2, 3].map(i => (
                        <TableRowSkeleton key={i} />
                    ))}
                </div>
            ) : recentDeposits.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state__icon">💸</div>
                    <div className="empty-state__title">No Deposits Yet</div>
                </div>
            ) : (
                <div style={{ background: 'var(--tg-theme-bg-color)', borderRadius: '12px', margin: '0 16px' }}>
                    {recentDeposits.map((d) => (
                        <div className="deposit-list-item" key={d.id}>
                            <div className="deposit-list-item__left">
                                <span className={`deposit-list-item__amount deposit-list-item__amount--${d.status}`}>
                                    +{Number(d.amount).toFixed(4)} ETB
                                </span>
                            </div>
                            <div className="deposit-list-item__right">
                                <span className="deposit-list-item__date">
                                    {new Date(d.created_at).toLocaleDateString()}
                                </span>
                                <span className={`deposit-list-item__status deposit-list-item__status--${d.status}`}>
                                    {d.status.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
