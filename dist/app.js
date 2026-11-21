import {renderCoverage, setupMonthlyHelp, monthCoverage} from './coverage.js';
import {DATA_ROOT, directionName, routesForBorough, validateCatalog, createRouteLoader} from './routes.js';

import {DAYS, MONTHS, compute, initialState, reduceState} from './model.js';
import {createCharts} from './charts.js';
import {loadD3} from './load-d3.js';
import {findings} from './findings.js';

const $ = selector => document.querySelector(selector);
let data, view, charts, catalog, activeEntry;
let loading = true;
const loadRoute = createRouteLoader();
let state = initialState();
const fmt = value => value === null ? '—' : value.toFixed(1);
const count = value => value.toLocaleString('en-US');
const name = segment => `${segment.from} → ${segment.to}`;
const hour = value => `${String(value).padStart(2, '0')}:00`;

function hideTooltip() { $('#tooltip').hidden = true; }
function tooltip(event, text) {
  const node = $('#tooltip');
  node.textContent = text;
  node.hidden = false;
  const rect = event.currentTarget?.getBoundingClientRect?.() || event.target.getBoundingClientRect();
  const x = event.clientX || rect.x + rect.width / 2;
  const y = event.clientY || rect.y;
  node.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - Math.min(310, window.innerWidth - 16)))}px`;
  node.style.top = `${Math.max(8, Math.min(y + 15, window.innerHeight - node.offsetHeight - 10))}px`;
}

function dispatch(action) {
  if (loading) return;
  state = reduceState(state, action);
  render();
}

function render() {
  if (!data || !charts) return;
  hideTooltip();
  view = compute(data, state);
  $('#direction').value = state.direction;
  $('#day').value = state.day;
  $('#hour-start').value = state.hours?.[0] ?? 0;
  $('#hour-end').value = state.hours?.[1] ?? 23;
  const day = state.day === 'all' ? 'All days' : DAYS[Number(state.day)];
  const month = state.month ? MONTHS[state.month - 1] : 'All months';
  const hours = state.hours ? `${hour(state.hours[0])}–${hour(state.hours[1] + 1)}` : 'All hours';
  $('#context').textContent = `${data.meta.route} · ${directionName(state.direction)} · ${day} · ${view.length} segment positions`;
  $('#bar-subtitle').textContent = `${month} · ${hours} · Ordered by earliest observed stop position`;
  $('#heat-subtitle').textContent = `${month} · Relative to each segment’s all-day speed across available 2025 observations for ${state.day === 'all' ? 'all days' : day + 's'}`;

  const insights = findings(view, state);
  $('#bar-finding').textContent = insights.bar;
  $('#heat-finding').textContent = insights.heat;
  $('#month-finding').textContent = insights.month;
  renderCoverage(view, state.selected);
  const picker = $('#segment-picker');
  picker.replaceChildren(new Option('All segments', ''), ...view.map((segment, i) =>
    new Option(`${i + 1}. ${segment.from} → ${segment.to} (${monthCoverage(segment).visible.length}/12 months)`, segment.id)));
  picker.value = state.selected || '';

  const chips = $('#chips');
  chips.replaceChildren();
  for (const [key, text] of [
    ['month', state.month ? month : null],
    ['hours', state.hours ? hours : null],
    ['selected', state.selected ? `Segment ${view.findIndex(d => d.id === state.selected) + 1}` : null]
  ]) {
    if (!text) continue;
    const button = document.createElement('button');
    button.textContent = `${text} ×`;
    button.setAttribute('aria-label', `Clear ${text}`);
    button.onclick = () => dispatch({type: 'clear', key});
    chips.append(button);
  }

  const maxTrips = charts.bars('#bars', view, state);
  charts.heatmap('#heatmap', view, state);
  charts.monthly('#monthly', view, state);
  $('#dot-scale').textContent = maxTrips ? `· largest: ${count(Math.max(...view.map(d => d.bar.trips)))}` : '';

  const selected = view.find(d => d.id === state.selected);
  const detail = $('#selection-detail');
  detail.replaceChildren();
  detail.hidden = !selected;
  if (selected) {
    const label = document.createElement('div');
    label.className = 'detail-label';
    label.textContent = 'Selected segment';
    const strong = document.createElement('strong');
    strong.textContent = name(selected);
    const small = document.createElement('small');
    small.textContent = selected.bar.speed === null
      ? 'No observations match the current filters.'
      : `${fmt(selected.bar.speed)} mph · ${count(selected.bar.trips)} observed trips in the bar view`;
    detail.append(label, strong, small);
  }
  $('#dashboard').setAttribute('aria-busy', 'false');
  $('#announcement').textContent = `${directionName(state.direction)}, ${day}, ${month}, ${hours}${selected ? ', selected ' + name(selected) : ''}`;
}

for (const id of ['hour-start', 'hour-end']) {
  for (let h = 0; h < 24; h++) {
    const option = document.createElement('option');
    option.value = h;
    option.textContent = hour(h);
    $('#' + id).append(option);
  }
}
$('#hour-end').value = 23;
$('#segment-picker').onchange = event => dispatch(event.target.value ? {type: 'segment', value: event.target.value} : {type: 'clear', key: 'selected'});
$('#direction').onchange = event => dispatch({type: 'direction', value: event.target.value});
$('#day').onchange = event => dispatch({type: 'day', value: event.target.value});
$('#reset').onclick = () => dispatch({type: 'reset'});
$('#apply-hours').onclick = () => dispatch({type: 'hours', value: [Number($('#hour-start').value), Number($('#hour-end').value)]});
$('#clear-hours').onclick = () => dispatch({type: 'hours', value: null});

$('#export').onclick = () => {
  if (!view || loading) return;
  const rows = [
    ['route', 'year', 'segment_id', 'segment_from', 'segment_to', 'direction', 'day', 'month', 'hour_start', 'hour_end', 'full_year_mean_road_distance_miles', 'average_speed_mph', 'observed_segment_trips'],
    ...view.map(d => [data.meta.route, data.meta.year, d.id, d.from, d.to, state.direction, state.day === 'all' ? 'All' : DAYS[+state.day], state.month ?? 'All', state.hours?.[0] ?? 0, state.hours?.[1] ?? 23, d.distance, d.bar.speed ?? '', d.bar.trips])
  ];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.meta.route}-${data.meta.year}-${state.direction}-selection.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function options(select, values, label = value => value) {
  select.replaceChildren(...values.map(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label(value);
    return option;
  }));
}
function busy(value) {
  loading = value;
  $('#dashboard').hidden = value;
  $('#dashboard').setAttribute('aria-busy', String(value));
  for (const selector of ['#direction', '#day', '#reset', '#export', '#apply-hours', '#clear-hours']) $(selector).disabled = value;
}
async function selectRoute() {
  const entry = catalog.routes.find(r => r.route === $('#route').value);
  if (!entry) return;
  activeEntry = entry;
  busy(true);
  data = null; view = null;
  hideTooltip();
  $('#chips').replaceChildren();
  $('#route-note').textContent = '';
  $('#error').hidden = true;
  $('#retry-route').hidden = true;
  $('#context').textContent = `Loading ${entry.route}…`;
  try {
    const loaded = await loadRoute(entry, catalog);
    if (!loaded) return;
    data = loaded;
    options($('#direction'), entry.directions, directionName);
    state = {...initialState(), direction: entry.directions[0]};
    const exclusions = entry.quarantinedRows || 0;
    $('#route-note').textContent = `Borough follows the source classification. Each row is a directed endpoint pair, ordered by its earliest observed stop position; positions may change during the year. Distances shown are full-year trip-weighted means.${exclusions ? ` ${exclusions} source records excluded because numeric values were invalid.` : ''}`;
    busy(false);
    render();
  } catch (error) {
    $('#context').textContent = `${entry.route} unavailable`;
    $('#error').textContent = error.message;
    $('#error').hidden = false;
    $('#retry-route').hidden = false;
  }
}
function selectBorough() {
  const entries = routesForBorough(catalog, $('#borough').value);
  const previous = $('#route').value;
  options($('#route'), entries.map(r => r.route));
  $('#route').value = entries.some(r => r.route === previous) ? previous : entries[0].route;
  selectRoute();
}
$('#borough').onchange = selectBorough;
$('#route').onchange = selectRoute;
$('#retry-route').onclick = () => catalog ? selectRoute() : start();
async function start() {
  busy(true);
  $('#error').hidden = true;
  $('#retry-route').hidden = true;
  try {
    const [d3, response] = await Promise.all([loadD3(), fetch(DATA_ROOT + 'catalog.json')]);
    if (!response.ok) throw Error('Route catalog not found. Copy the complete nyc-data-v6 folder into dist, then retry.');
    catalog = validateCatalog(await response.json());
    charts = createCharts(d3, {
      onSegment: value => dispatch({type: 'segment', value}),
      onHours: value => dispatch({type: 'hours', value}),
      onMonth: value => dispatch({type: 'month', value}),
      tooltip, hideTooltip,
      duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180
    });
    const boroughs = [...new Set(catalog.routes.flatMap(r => r.boroughs))].sort();
    options($('#borough'), boroughs);
    $('#borough').value = boroughs.includes('Brooklyn') ? 'Brooklyn' : boroughs[0];
    options($('#route'), routesForBorough(catalog, $('#borough').value).map(r => r.route));
    if (routesForBorough(catalog, $('#borough').value).some(r => r.route === 'B4')) $('#route').value = 'B4';
    $('#borough').disabled = false;
    $('#route').disabled = false;
    await selectRoute();
  } catch (error) {
    $('#error').hidden = false;
    $('#error').textContent = error.message;
    $('#dashboard').hidden = true;
    $('#context').textContent = 'Dashboard unavailable';
    $('#retry-route').hidden = false;
  }
}
setupMonthlyHelp();
start();
