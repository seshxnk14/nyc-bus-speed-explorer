export const DATA_ROOT = './nyc-data-v6/';
export const directionName = code => ({E: 'Eastbound', W: 'Westbound', N: 'Northbound', S: 'Southbound'}[code] || code);
const compare = (a, b) => a.localeCompare(b, 'en', {numeric: true});
export function routesForBorough(catalog, borough) {
  return catalog.routes.filter(r => !borough || r.boroughs.includes(borough)).sort((a,b) => compare(a.route,b.route));
}
export function validateCatalog(catalog) {
  if (!Array.isArray(catalog?.routes) || !catalog.routes.length) throw Error('The route catalog is empty or invalid.');
  const ids = new Set();
  for (const r of catalog.routes) {
    if (typeof r.route !== 'string' || ids.has(r.route) || !Array.isArray(r.boroughs) || !r.boroughs.length ||
        !Array.isArray(r.directions) || !r.directions.length || !/^routes\/[a-zA-Z0-9_-]+\.json$/.test(r.file)) {
      throw Error('The route catalog contains an invalid entry.');
    }
    ids.add(r.route);
  }
  return catalog;
}
export function validateRoute(data, entry, catalog) {
  if (data?.meta?.route !== entry.route || data.meta.year !== catalog.year || data.meta.service !== catalog.service ||
      !Array.isArray(data.rows) || data.rows.length !== entry.rows ||
      !Array.isArray(data.segments) || data.segments.length !== entry.segments) {
    throw Error(`The data file for ${entry.route} does not match the catalog.`);
  }
  const ids = new Set(data.segments.map(s => s.id));
  if (ids.size !== data.segments.length || data.segments.some(s => !entry.directions.includes(s.direction)) ||
      data.rows.some(r => !ids.has(r[0]))) throw Error(`Invalid segment references in ${entry.route}.`);
  return data;
}
// Sequence checking prevents a slower previous request from replacing the newest selection.
export function createRouteLoader(fetcher = fetch) {
  let sequence = 0, controller;
  return async (entry, catalog) => {
    const token = ++sequence;
    controller?.abort();
    controller = new AbortController();
    try {
      const response = await fetcher(DATA_ROOT + entry.file, {signal: controller.signal});
      if (!response.ok) throw Error(`Could not load ${entry.route}. Check that ${DATA_ROOT}${entry.file} exists.`);
      const data = await response.json();
      if (token !== sequence) return null;
      return validateRoute(data, entry, catalog);
    } catch (error) {
      if (token !== sequence) return null;
      throw error;
    }
  };
}
