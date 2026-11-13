
import {DAYS, MONTHS, compute, initialState, reduceState} from './model.js';
import {createCharts} from './charts.js';
import {loadD3} from './load-d3.js';
import {findings} from './findings.js';

const $ = selector => document.querySelector(selector);
let data, view, charts;
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
  state = reduceState(state, action);
  render();
}

function render() {
  if (!data || !charts) return;
  hideTooltip();
  view = compute(data, state);
  $('#east').setAttribute('aria-pressed', String(state.direction === 'E'));
  $('#west').setAttribute('aria-pressed', String(state.direction === 'W'));
  $('#day').value = state.day;
  $('#hour-start').value = state.hours?.[0] ?? 0;
  $('#hour-end').value = state.hours?.[1] ?? 23;
  const day = state.day === 'all' ? 'All days' : DAYS[Number(state.day)];
  const month = state.month ? MONTHS[state.month - 1] : 'All months';
  const hours = state.hours ? `${hour(state.hours[0])}–${hour(state.hours[1] + 1)}` : 'All hours';
  $('#context').textContent = `${state.direction === 'E' ? 'Eastbound' : 'Westbound'} · ${day} · ${view.length} segments`;
  $('#bar-subtitle').textContent = `${month} · ${hours} · In route order`;
  $('#heat-subtitle').textContent = `${month} · Relative to each segment’s full-year, all-day speed for ${state.day === 'all' ? 'all days' : day + 's'}`;

  const insights = findings(view, state);
  $('#bar-finding').textContent = insights.bar;
  $('#heat-finding').textContent = insights.heat;
  $('#month-finding').textContent = insights.month;

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
  $('#announcement').textContent = `${state.direction === 'E' ? 'Eastbound' : 'Westbound'}, ${day}, ${month}, ${hours}${selected ? ', selected ' + name(selected) : ''}`;
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
$('#east').onclick = () => dispatch({type: 'direction', value: 'E'});
$('#west').onclick = () => dispatch({type: 'direction', value: 'W'});
$('#day').onchange = event => dispatch({type: 'day', value: event.target.value});
$('#reset').onclick = () => dispatch({type: 'reset'});
$('#apply-hours').onclick = () => dispatch({type: 'hours', value: [Number($('#hour-start').value), Number($('#hour-end').value)]});
$('#clear-hours').onclick = () => dispatch({type: 'hours', value: null});

$('#export').onclick = () => {
  if (!view) return;
  const rows = [
    ['segment_from', 'segment_to', 'direction', 'day', 'month', 'hour_start', 'hour_end', 'road_distance_miles', 'average_speed_mph', 'observed_segment_trips'],
    ...view.map(d => [d.from, d.to, state.direction, state.day === 'all' ? 'All' : DAYS[+state.day], state.month ?? 'All', state.hours?.[0] ?? 0, state.hours?.[1] ?? 23, d.distance, d.bar.speed ?? '', d.bar.trips])
  ];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `B4-2025-${state.direction}-selection.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

async function start() {
  try {
    const [d3, response] = await Promise.all([loadD3(), fetch('./data.json')]);
    if (!response.ok) throw new Error('The dataset could not be loaded. Please reload the page.');
    data = await response.json();
    charts = createCharts(d3, {
      onSegment: value => dispatch({type: 'segment', value}),
      onHours: value => dispatch({type: 'hours', value}),
      onMonth: value => dispatch({type: 'month', value}),
      tooltip, hideTooltip,
      duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180
    });
    render();
  } catch (error) {
    $('#error').hidden = false;
    $('#error').textContent = error.message;
    $('#dashboard').hidden = true;
    $('#context').textContent = 'Dashboard unavailable';
    console.error(error);
  }
}
start();
