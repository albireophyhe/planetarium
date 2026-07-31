export const APP_ROUTE_PATHS = {
  events: "/events",
  sky: "/sky",
} as const;

export type AppRoute = keyof typeof APP_ROUTE_PATHS;

export function appRouteFromPathname(pathname: string): AppRoute {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalizedPathname === APP_ROUTE_PATHS.events
    ? "events"
    : "sky";
}

export function pathnameForAppRoute(route: AppRoute): string {
  return APP_ROUTE_PATHS[route];
}
