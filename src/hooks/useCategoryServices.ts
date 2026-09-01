import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServicesByCategory } from '../api';
import type { Service } from '../types';
import { useApp } from '../context/AppContext';

export function useCategoryServices(category?: string, ids?: number[], forceRefresh = false) {
    const { services: appServices } = useApp();

    // Instant in-memory filter from AppContext services (0ms latency)
    const derivedServices = useMemo(() => {
        if (!category && (!ids || ids.length === 0)) return [];
        if (!appServices || appServices.length === 0) return [];

        if (category === 'Top Services' || (!category && ids && ids.length > 0)) {
            if (!ids || ids.length === 0) return [];
            const idSet = new Set(ids);
            return appServices.filter(s => idSet.has(s.id));
        }

        if (category) {
            return appServices.filter(s => s.category === category);
        }

        return [];
    }, [appServices, category, ids]);

    return useQuery<Service[]>({
        queryKey: ['services', 'category', category, ids?.join(','), forceRefresh],
        queryFn: async () => {
            try {
                const data = await getServicesByCategory(
                    category,
                    category === 'Top Services' ? ids : undefined,
                    forceRefresh
                );
                
                const transformed = data.map((s: any) => ({
                    id: s.service || s.id,
                    category: s.category,
                    name: s.name,
                    type: s.type,
                    rate: parseFloat(s.rate),
                    original_rate: parseFloat(s.original_rate ?? s.rate),
                    min: s.min,
                    max: s.max,
                    averageTime: s.average_time || s.averageTime || '',
                    refill: s.refill,
                    cancel: s.cancel,
                    custom_description: s.custom_description,
                }));

                if (transformed.length > 0) return transformed;
            } catch (e) {
                console.warn(`[useCategoryServices] Fetch failed for category ${category}, using derived fallback`);
            }

            return derivedServices;
        },
        initialData: derivedServices.length > 0 ? derivedServices : undefined,
        placeholderData: (prev) => prev || (derivedServices.length > 0 ? derivedServices : undefined),
        enabled: !!category || !!(ids && ids.length > 0),
        staleTime: 5 * 60 * 1000, // 5 minutes cache for 0ms instant loading
    });
}
