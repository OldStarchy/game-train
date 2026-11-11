import {
	lazyRouteComponent,
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from '@tanstack/react-router';
import { JoinCodeSchema, type JoinCode } from '../protocol/role';
import { RoomIdSchema } from '../protocol/topics';
import { AudienceRoute } from '../roles/audience/AudienceRoute';
import { PlayerRoute } from '../roles/player/PlayerRoute';
import { ScreenRoute } from '../roles/screen/ScreenRoute';
import { Home } from './Home';
import { NotFound } from './NotFound';

/**
 * URLs are untrusted input (anyone can edit a QR link), so route params are
 * parsed with their protocol schemas here. Components receive validated,
 * typed values; an invalid code renders the not-found page.
 */
const roomParams = {
	parse: ({ code }: { code: string }): { code: JoinCode } => ({
		code: JoinCodeSchema.parse(code),
	}),
	stringify: ({ code }: { code: JoinCode }) => ({ code }),
};

const rootRoute = createRootRoute({
	component: Outlet,
	notFoundComponent: NotFound,
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });

const hostRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/host',
	// Host screens load on demand so players' phones download less.
	component: lazyRouteComponent(() => import('../roles/host/HostRoute'), 'HostRoute'),
});

export const hostRoomRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/host/room/$roomId',
	params: {
		parse: ({ roomId }: { roomId: string }) => ({ roomId: RoomIdSchema.parse(roomId) }),
		stringify: ({ roomId }: { roomId: string }) => ({ roomId }),
	},
	errorComponent: NotFound,
	component: lazyRouteComponent(() => import('../roles/host/HostRoomRoute'), 'HostRoomRoute'),
});

export const joinRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/join/$code',
	params: roomParams,
	errorComponent: NotFound,
	component: PlayerRoute,
});

export const screenRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/screen/$code',
	params: roomParams,
	errorComponent: NotFound,
	component: ScreenRoute,
});

export const audienceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/audience/$code',
	params: roomParams,
	errorComponent: NotFound,
	component: AudienceRoute,
});

export const routeTree = rootRoute.addChildren([
	homeRoute,
	hostRoute,
	hostRoomRoute,
	joinRoute,
	screenRoute,
	audienceRoute,
]);

// Hash history: GitHub Pages has no SPA fallback, and join links in QR codes
// must survive a cold load.
export const router = createRouter({ routeTree, history: createHashHistory() });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
