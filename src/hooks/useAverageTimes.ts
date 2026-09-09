import { useQuery } from '@tanstack/react-query';
import { getAverageTimes } from '../api';

const LOCAL_STORAGE_KEY = 'primora_average_times_cache';

export function useAverageTimes() {
    return useQuery<Record<string, string>>({
        queryKey: ['average-times'],
        queryFn: async () => {
            // Pass forceRefresh = true to trigger live SWR background sync with JAP.com
            const freshData = await getAverageTimes(true);
            if (freshData && Object.keys(freshData).length > 0) {
                try {
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(freshData));
                } catch (e) {
                    console.error('[SWR] Failed to save average times to localStorage:', e);
                }
            }
            return freshData;
        },
        initialData: () => {
            try {
                const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                        return parsed;
                    }
                }
            } catch (e) {}
            return undefined;
        },
        staleTime: 0,                         // Stale immediately -> triggers background revalidation on load (SWR)
        refetchInterval: 30 * 1000,           // Revalidate in background every 30 seconds for real-time JAP sync
        refetchOnWindowFocus: true,           // Revalidate on window focus
        refetchOnMount: 'always',             // Revalidate when component mounts
        placeholderData: (prev) => prev,       // Serve stale data while background fetch executes (zero latency)
        retry: 2,
    });
}
