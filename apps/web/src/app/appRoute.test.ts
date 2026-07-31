import { describe, expect, it } from "vitest";
import {
  appRouteFromPathname,
  pathnameForAppRoute,
} from "./appRoute";

describe("appRoute", () => {
  it.each([
    ["/sky", "sky"],
    ["/sky/", "sky"],
    ["/events", "events"],
    ["/events/", "events"],
    ["/", "sky"],
    ["/unknown", "sky"],
  ] as const)("maps %s to %s", (pathname, expectedRoute) => {
    expect(appRouteFromPathname(pathname)).toBe(expectedRoute);
  });

  it("provides canonical paths for both screens", () => {
    expect(pathnameForAppRoute("sky")).toBe("/sky");
    expect(pathnameForAppRoute("events")).toBe("/events");
  });
});
