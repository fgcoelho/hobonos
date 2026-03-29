export type RouteHandle = {
  kind: "route";
  id: string;
};

export type PageHandle = {
  kind: "page";
  id: string;
  routeId: string;
};

export type ComponentHandle = {
  kind: "component";
  id: string;
  routeId: string;
};
