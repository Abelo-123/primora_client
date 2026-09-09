import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const CACHE_PATH = path.join(__dirname, '..', 'api', 'cache', 'average_times.json');
const CHANGES_PATH = path.join(__dirname, '..', 'api', 'cache', 'recent_changes.json');
const ROOT_JSON_PATH = path.join(__dirname, '..', 'services_average_time.json');

// RAM Cache initialized on module load / server startup
let inMemoryDataMap = null;
let inMemoryCacheMtimeMs = Date.now();
let inMemoryChangesMtimeMs = 0;
let inMemoryChanges = [];
let inMemoryChangedCount = 0;

function computeDiff(oldMap, newMap) {
    const diff = [];
    const timestamp = new Date().toISOString();

    for (const [id, newTime] of Object.entries(newMap)) {
        const oldTime = oldMap[id];
        if (oldTime !== undefined && oldTime !== newTime) {
            diff.push({ service_id: id, status: "TIME_UPDATED", old_time: oldTime, new_time: newTime, changed_at: timestamp });
        } else if (oldTime === undefined) {
            diff.push({ service_id: id, status: "NEW_SERVICE", old_time: null, new_time: newTime, changed_at: timestamp });
        }
    }

    return diff;
}

function loadCacheInMemory() {
    try {
        const now = new Date();

        if (!inMemoryDataMap) {
            inMemoryCacheMtimeMs = now.getTime();

            if (fs.existsSync(ROOT_JSON_PATH)) {
                inMemoryDataMap = JSON.parse(fs.readFileSync(ROOT_JSON_PATH, 'utf8'));
            } else if (fs.existsSync(CACHE_PATH)) {
                inMemoryDataMap = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
            } else {
                inMemoryDataMap = {};
            }

            const dir = path.dirname(CACHE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(CACHE_PATH, JSON.stringify(inMemoryDataMap, null, 2), 'utf8');
            fs.utimesSync(CACHE_PATH, now, now);
            console.log(`[AverageTimes Route] RAM Cache initialized with ${Object.keys(inMemoryDataMap).length} services.`);
        }

        if (fs.existsSync(CHANGES_PATH)) {
            const cStat = fs.statSync(CHANGES_PATH);
            if (cStat.mtimeMs !== inMemoryChangesMtimeMs) {
                inMemoryChangesMtimeMs = cStat.mtimeMs;
                try {
                    const changesJson = JSON.parse(fs.readFileSync(CHANGES_PATH, 'utf8'));
                    inMemoryChanges = changesJson.changes || [];
                    inMemoryChangedCount = changesJson.total_changed || 0;
                } catch (e) {
                    inMemoryChanges = [];
                    inMemoryChangedCount = 0;
                }
            }
        }
    } catch (e) {
        console.error('[AverageTimes Route] Cache load error:', e.message);
    }
}

function syncAndTouchCache(forceUpdateMtime = false) {
    try {
        const now = new Date();

        if (fs.existsSync(ROOT_JSON_PATH)) {
            const freshData = JSON.parse(fs.readFileSync(ROOT_JSON_PATH, 'utf8'));
            const baseline = inMemoryDataMap || {};
            const changes = computeDiff(baseline, freshData);

            if (changes.length > 0) {
                inMemoryDataMap = { ...baseline, ...freshData };
                inMemoryChanges = changes;
                inMemoryChangedCount = changes.length;

                fs.writeFileSync(CACHE_PATH, JSON.stringify(inMemoryDataMap, null, 2), 'utf8');
                fs.utimesSync(CACHE_PATH, now, now);

                const changesPayload = {
                    last_scrape_at: now.toISOString(),
                    total_changed: changes.length,
                    changes: changes
                };
                fs.writeFileSync(CHANGES_PATH, JSON.stringify(changesPayload, null, 2), 'utf8');
                inMemoryCacheMtimeMs = now.getTime();
                inMemoryChangesMtimeMs = now.getTime();
            } else if (forceUpdateMtime) {
                if (fs.existsSync(CACHE_PATH)) {
                    fs.utimesSync(CACHE_PATH, now, now);
                }
                inMemoryCacheMtimeMs = now.getTime();
            }
        }
    } catch (e) {
        console.error('[AverageTimes Sync Error]:', e.message);
    }
}

// Ensure timestamp is touched on module load
try {
    const startupNow = new Date();
    if (fs.existsSync(CACHE_PATH)) {
        fs.utimesSync(CACHE_PATH, startupNow, startupNow);
    }
} catch(e) {}

router.all('/', (req, res) => {
    loadCacheInMemory();

    const forceRefresh = req.query.refresh === '1' || req.query.action === 'refresh' || req.query.force === 'true';
    const cacheAgeSeconds = Math.round((Date.now() - inMemoryCacheMtimeMs) / 1000);
    const isStale = cacheAgeSeconds > 60 || inMemoryCacheMtimeMs === 0;

    if (forceRefresh || isStale) {
        syncAndTouchCache(forceRefresh);
    }

    const dataMap = inMemoryDataMap || {};
    const requestTime = new Date().toISOString();
    const lastUpdated = new Date(inMemoryCacheMtimeMs).toISOString();
    const age = Math.max(0, Math.round((Date.now() - inMemoryCacheMtimeMs) / 1000));

    res.json({
        success: true,
        mode: forceRefresh ? "SWR_REVALIDATED_SERVE" : "SWR_INSTANT_SERVE",
        request_timestamp: requestTime,
        last_cache_update: lastUpdated,
        cache_age_seconds: age,
        service_8651: dataMap['8651'] || 'Not Found',
        total_services: Object.keys(dataMap).length,
        recently_updated_count: inMemoryChangedCount,
        recently_updated_services: inMemoryChanges,
        data: dataMap
    });
});

export default router;
