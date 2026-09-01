import { useQuery } from '@tanstack/react-query';
import { getServices } from '../api';
import type { Service } from '../types';
import { useApp } from '../context/AppContext';

export function useAllServices(forceRefresh = false) {
    const { services: appServices } = useApp();

    return useQuery<Service[]>({
        queryKey: ['services', 'all', forceRefresh],
        queryFn: async () => {
            const data = await getServices(false, forceRefresh);
            return data.map((s: any) => ({
                 id: s.service || s.id,
                 category: s.category,
                 name: s.name,
                 type: s.type as Service['type'],
                 rate: parseFloat(s.rate),
                 original_rate: parseFloat(s.original_rate ?? s.rate),
                 min: s.min,
                 max: s.max,
                 averageTime: s.average_time || s.averageTime || '',
                 refill: s.refill,
                 cancel: s.cancel,
                 custom_description: s.custom_description,
             }));
        },
        initialData: appServices.length > 0 ? appServices : undefined,
        placeholderData: (prev) => prev || (appServices.length > 0 ? appServices : undefined),
        staleTime: 5 * 60 * 1000,
    });
}
