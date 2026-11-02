// SIDEBAR_MENU keys use underscores (e.g. "sample_registration"); URLs use hyphens
// (e.g. "/sample-registration") since that's the conventional URL style. These two
// functions are the single place that conversion happens.
export const keyToPath = (key) => "/" + key.replace(/_/g, "-");
export const pathToKey = (pathname) => pathname.replace(/^\//, "").replace(/-/g, "_") || "dashboard";
