/**
 * Paxyso Mini App Backend — Node.js Entry Point
 */
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import 'dotenv/config';

import pool from './config/database.js';
import depositRouter from './routes/deposit.js';
import completeDepositRouter from './routes/completeDeposit.js';
import verifyDepositRouter from './routes/verifyDeposit.js';
import chapaCallbackRouter from './routes/chapaCallback.js';
import getDepositsRouter from './routes/getDeposits.js';
import getBalanceRouter from './routes/getBalance.js';
import getServicesRouter from './routes/getServices.js';
import ordersRouter from './routes/orders.js';
import appRouter from './routes/app.js';
import chatRouter from './routes/chat.js';
import getCategoriesRouter from './routes/getCategories.js';
import adminUsersRouter from './routes/admin.js';
import recommendedServicesRouter from './routes/recommendedServices.js';
import referralRouter from './routes/referral.js';
import averageTimesRouter from './routes/averageTimes.js';

const app = express();

// Ensure database columns exist on startup
(async () => {
    try {
        const conn = await pool.getConnection();
        try {
            // Ensure orders custom_fields exists
            try {
                await conn.execute('ALTER TABLE orders ADD COLUMN custom_fields JSON AFTER status');
                console.log('[Startup] Checked/Added custom_fields column to orders table');
            } catch (e) { }

            // Ensure service_custom table exists
            await conn.execute(`
                CREATE TABLE IF NOT EXISTS service_custom (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    service_id INT NOT NULL UNIQUE,
                    is_enabled TINYINT DEFAULT 1,
                    custom_rate DECIMAL(10, 2),
                    profit_margin DECIMAL(5, 2),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Ensure custom_description column exists in service_custom
            try {
                await conn.execute('ALTER TABLE service_custom ADD COLUMN custom_description TEXT');
                console.log('[Startup] Checked/Added custom_description column to service_custom table');
            } catch (e) { }
        } finally {
            conn.release();
        }
    } catch (e) {
        console.error('[Startup] DB check failed:', e.message);
    }
})();

// cPanel/Passenger priority: Always use process.env.PORT if provided.
// On cPanel, this is usually a path to a socket, not a number.
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ optionsSuccessStatus: 200 }));
app.use(compression({
    level: 6,
    threshold: 1024
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// DEBUG ROUTES - Test if server is running
app.get('/api/debug', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running!' });
});

app.get('/api/debug/db', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        const [tables] = await conn.query('SHOW TABLES');
        const [authRows] = await conn.query('SELECT COUNT(*) as cnt FROM auth');
        conn.release();
        res.json({
            status: 'success',
            dbConnected: true,
            tables: tables.length,
            userCount: authRows[0].cnt
        });
    } catch (e) {
        res.json({
            status: 'error',
            dbConnected: false,
            error: e.message,
            code: e.code,
            errno: e.errno
        });
    }
});

app.get('/api/debug/env', (req, res) => {
    const maskedEnv = {};
    const sensitiveKeywords = [
        'key', 'pass', 'secret', 'token', 'pwd', 'credential', 'auth', 'private', 'cert', 'database', 'db', 'url', 'uri', 'conn', 'hash', 'salt'
    ];

    for (const key of Object.keys(process.env)) {
        const value = process.env[key] || '';
        const lowerKey = key.toLowerCase();
        const isSensitive = sensitiveKeywords.some(keyword => lowerKey.includes(keyword));

        if (isSensitive) {
            if (value.length > 8) {
                maskedEnv[key] = `${value.substring(0, 3)}...${value.substring(value.length - 3)} (len: ${value.length})`;
            } else if (value.length > 0) {
                maskedEnv[key] = `*** (len: ${value.length})`;
            } else {
                maskedEnv[key] = '[EMPTY]';
            }
        } else {
            maskedEnv[key] = value;
        }
    }

    res.json({
        status: 'success',
        env: maskedEnv
    });
});


// Test DB connection
app.get('/api/test-db', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM auth');
        res.json({ success: true, userCount: rows[0].cnt });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Test Deposit Notification Simulation (GET / POST)
app.all(['/api/test-deposit-notification', '/api/simulate-deposit'], async (req, res) => {
    try {
        const amount = parseFloat(req.query.amount || req.body?.amount || 250);
        const userId = String(req.query.user_id || req.query.tg_id || req.body?.user_id || '5928771903');
        const firstName = String(req.query.first_name || req.query.name || req.body?.first_name || 'RealUserSim');
        const botId = req.query.bot_id || req.body?.bot_id || '8590320768';
        const txRef = `DEP-SIM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const conn = await pool.getConnection();
        try {
            const [users] = await conn.execute('SELECT * FROM auth WHERE tg_id = ? AND bot_id = ?', [userId, botId]);
            if (users.length === 0) {
                await conn.execute('INSERT INTO auth (tg_id, bot_id, first_name, balance, auth_provider, last_login) VALUES (?, ?, ?, 0.00, "telegram", NOW())', [userId, botId, firstName]);
            } else if (firstName && users[0].first_name !== firstName) {
                await conn.execute('UPDATE auth SET first_name = ? WHERE tg_id = ? AND bot_id = ?', [firstName, userId, botId]);
            }

            await conn.execute('INSERT INTO deposits (user_id, bot_id, amount, tx_ref, chapa_tx_ref, status, completed_at) VALUES (?, ?, ?, ?, ?, "success", NOW())', [userId, botId, amount, txRef, `CHAPA-SIM-${Date.now()}`]);
            await conn.execute('UPDATE auth SET balance = balance + ? WHERE tg_id = ? AND bot_id = ?', [amount, userId, botId]);
            const [balRows] = await conn.execute('SELECT balance FROM auth WHERE tg_id = ? AND bot_id = ?', [userId, botId]);
            const newBalance = balRows.length > 0 ? parseFloat(balRows[0].balance) : 0;
            conn.release();

            let notifyResult = null;
            try {
                const botRes = await fetch('https://primore-bot.onrender.com/api/sendToJohn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'deposit', uid: userId, amount, uuid: firstName })
                });
                notifyResult = await botRes.text();
            } catch (err) {
                notifyResult = err.message;
            }

            return res.json({
                success: true,
                simulation: true,
                message: 'Deposit notification simulation triggered successfully!',
                details: {
                    tx_ref: txRef,
                    user_id: userId,
                    first_name: firstName,
                    amount,
                    new_balance: newBalance,
                    bot_id: botId,
                    notification: notifyResult
                }
            });
        } catch (dbErr) {
            conn.release();
            throw dbErr;
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Chapa Routes
app.use('/api/deposit', depositRouter);
app.use('/api/complete-deposit', completeDepositRouter);
app.use('/api/verify-deposit', verifyDepositRouter);
app.use('/api/chapa-callback', chapaCallbackRouter);

// Dynamically load Telegram Webhook to prevent server crashes if file isn't uploaded
import('./routes/telegramWebhook.js')
    .then(module => {
        app.use('/api/telegram-webhook', module.default);
        console.log('[Startup] Telegram Webhook Router loaded successfully.');
    })
    .catch(err => {
        console.warn('[Startup] Skipping Telegram Webhook (file missing or error):', err.message);
    });

// User Data Routes
app.use('/api/deposits', getDepositsRouter);
app.use('/api/balance', getBalanceRouter);
app.use('/api/services', getServicesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/app', appRouter);
app.use('/api/chat', chatRouter);
app.use('/api/categories', getCategoriesRouter);
app.use('/api/admin', adminUsersRouter);
app.use('/api/services', recommendedServicesRouter);
app.use('/api/referral', referralRouter);
app.use('/api/average-times', averageTimesRouter);

// Start server
// In cPanel/Passenger, we MUST NOT specify a port number if we want it to handle routing.
// However, the function requires one or it defaults to a random one.
// The trick is to listen on the variable provided by Passenger.
app.listen(PORT, () => {
    console.log(`🚀 Paxyo Backend running on port ${PORT}`);
});
