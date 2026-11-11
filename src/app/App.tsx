import { createHashRouter, RouterProvider } from 'react-router';
import { AudienceRoute } from '../roles/audience/AudienceRoute';
import { HostRoute } from '../roles/host/HostRoute';
import { PlayerRoute } from '../roles/player/PlayerRoute';
import { ScreenRoute } from '../roles/screen/ScreenRoute';
import { Home } from './Home';

// Hash routing: GitHub Pages has no SPA fallback, and join links in QR codes
// must survive a cold load.
const router = createHashRouter([
	{ path: '/', element: <Home /> },
	{ path: '/host', element: <HostRoute /> },
	{ path: '/join/:code?', element: <PlayerRoute /> },
	{ path: '/screen/:code', element: <ScreenRoute /> },
	{ path: '/audience/:code', element: <AudienceRoute /> },
]);

export function App() {
	return <RouterProvider router={router} />;
}
