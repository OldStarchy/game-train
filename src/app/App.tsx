import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { takeReturnRoute } from '../backend/auth';
import { configFromEnv } from '../backend/client';
import { router } from './router';
import { createServices, ServicesProvider, type Services } from './services';

export function App() {
	const [services] = useState<Services | null>(() => {
		const config = configFromEnv();
		return config ? createServices(config) : null;
	});

	if (!services) return <NotConfigured />;
	return (
		<ServicesProvider services={services}>
			<SignInReturn services={services} />
			<RouterProvider router={router} />
		</ServicesProvider>
	);
}

/**
 * After an OAuth or email sign-in the browser lands on the site root with
 * `?code=…`, which supabase-js exchanges for a session. Then return to the
 * page that started the sign-in and tidy the URL.
 */
function SignInReturn({ services }: { services: Services }) {
	useEffect(() => {
		const { data } = services.client.auth.onAuthStateChange((event) => {
			if (event !== 'SIGNED_IN') return;
			const url = new URL(window.location.href);
			if (url.searchParams.has('code')) {
				url.searchParams.delete('code');
				window.history.replaceState(null, '', url.toString());
			}
			const path = takeReturnRoute();
			if (path) void router.navigate({ to: path });
		});
		return () => {
			data.subscription.unsubscribe();
		};
	}, [services]);
	return null;
}

function NotConfigured() {
	return (
		<main className="page">
			<h1>Not configured</h1>
			<p className="lead">
				This build has no Supabase settings. Copy <code>.env.example</code> to{' '}
				<code>.env.local</code> and fill it in (see <code>supabase/README.md</code>).
			</p>
		</main>
	);
}
