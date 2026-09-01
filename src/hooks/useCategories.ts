import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getCategories } from '../api';
import { useApp } from '../context/AppContext';

export function useCategories(platform: string) {
    const { services } = useApp();

    // Instant in-memory fallback categories from AppContext services (0ms latency)
    const derivedFromServices = useMemo(() => {
        if (!platform || !services || services.length === 0) return [];
        if (platform === 'top') return ['Top Services'];
        const p = platform.toLowerCase();
        const set = new Set<string>();
        services.forEach(s => {
            if (s.category && s.category.toLowerCase().includes(p)) {
                set.add(s.category);
            }
        });
        return Array.from(set);
    }, [services, platform]);

    return useQuery<string[]>({
        queryKey: ['categories', platform],
        queryFn: async () => {
            if (platform === 'top') return ['Top Services'];
            try {
                const res = await getCategories(platform);
                if (res && res.length > 0) return res;
            } catch (e) {
                console.warn(`[useCategories] Fetch failed for platform ${platform}, using fallback`);
            }
            return derivedFromServices;
        },
        placeholderData: (prev) => prev || (derivedFromServices.length > 0 ? derivedFromServices : undefined),
        staleTime: 0, // Always revalidate in background to fetch latest live DB data
        refetchOnMount: 'always',
    });
}
