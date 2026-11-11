import { createContext, useContext, type ReactNode } from 'react';
import { createBackendClient, type BackendConfig, type Client } from '../backend/client';
import { SupabaseTransport } from '../transport/supabase';
import type { Transport } from '../transport/types';

export interface Services {
	client: Client;
	transport: Transport;
}

const ServicesContext = createContext<Services | null>(null);

export function createServices(config: BackendConfig): Services {
	const client = createBackendClient(config);
	const transport = new SupabaseTransport(
		client,
		import.meta.env.DEV
			? (topic, payload) => {
					console.warn('Dropped invalid message', topic, payload);
				}
			: undefined,
	);
	return { client, transport };
}

export function ServicesProvider({
	services,
	children,
}: {
	services: Services;
	children: ReactNode;
}) {
	return <ServicesContext value={services}>{children}</ServicesContext>;
}

export function useServices(): Services {
	const services = useContext(ServicesContext);
	if (!services) throw new Error('useServices outside ServicesProvider');
	return services;
}
