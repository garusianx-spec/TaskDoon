import type {
ActiveBroadcasts,
} from '@taskin/contracts';
import { http } from '@/lib/api-client';

export const adminEndpoints = {
  broadcasts: {
    active: () => http.get<ActiveBroadcasts>('/broadcasts/active'),
  },
};
