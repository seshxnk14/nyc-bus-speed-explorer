import {heatColor, heatTextColor} from './heat-colors.js';

import {MONTHS} from './model.js';

const palette = {
  ink: '#192c32', muted: '#4d6268', accent: '#bc4f2b', grid: '#e4e7e1',
  bar: '#82999d', otherLine: '#718990', selected: '#faf1e8'
};
const fmt = value => value === null ? '—' : value.toFixed(1);
const count = value => value.toLocaleString('en-US');
const segmentName = segment => `${segment.from} → ${segment.to}`;
const hour = value => `${String(value).padStart(2, '0')}:00`;

export function createCharts(d3, {onSegment, onHours, onMonth, tooltip, hideTooltip, duration = 180}) {
  let restoringBrush = false;

  function chart(host, width, height, label) {
    return d3.select(host).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'group')
      .attr('aria-label', label).attr('data-renderer', 'D3.js');
  }

  function label(parent, className, x, y, content, anchor = 'start') {
    return parent.selectAll(`text.${className}`).data([content]).join('text')
      .attr('class', className).attr('x', x).attr('y', y)
      .attr('text-anchor', anchor).attr('fill', palette.muted).attr('font-size', 12).text(content);
  }

  function interactive(selection, getLabel, action, getTooltip) {
    selection.attr('tabindex', 0).attr('role', 'button').classed('interactive', true)
      .attr('aria-label', getLabel)
      .on('click.select', (event, datum) => action(datum, event))
      .on('keydown.select', (event, datum) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); action(datum, event);
        }
      });
    if (getTooltip) {
      selection.on('pointermove.tooltip', (event, datum) => tooltip(event, getTooltip(datum)))
        .on('focus.tooltip', (event, datum) => tooltip(event, getTooltip(datum)))
        .on('pointerleave.tooltip blur.tooltip', hideTooltip);
    }
    return selection;
  }

  function animate(selection) {
    selection.interrupt();
    return duration ? selection.transition().duration(duration) : selection;
  }

  function bars(host, view, state) {
    const width = 1200, left = 405, right = 75, top = 22, rowHeight = 46;
    const height = top + view.length * rowHeight + 40;
    const svg = chart(host, width, height, 'Segment average road speeds in source stop-position order');
    const maximum = Math.max(12, Math.ceil(d3.max(view, d => d.bar.speed) / 2) * 2 || 12);
    const x = d3.scaleLinear().domain([0, maximum]).range([left, width - right]);
    const y = d3.scaleBand().domain(view.map(d => d.id)).range([top, top + view.length * rowHeight]);
    const maxTrips = d3.max(view, d => d.bar.trips) || 1;
    const size = d3.scaleSqrt().domain([0, maxTrips]).range([0, 10]);
    const axis = svg.selectAll('g.speed-axis').data([null]).join('g').attr('class', 'speed-axis')
      .attr('transform', `translate(0,${top + view.length * rowHeight - 5})`)
      .call(d3.axisBottom(x).ticks(maximum / 2).tickSize(-(view.length * rowHeight)).tickPadding(12));
    axis.select('.domain').remove();
    axis.selectAll('.tick line').attr('stroke', palette.grid).attr('stroke-dasharray', '2 4');
    axis.selectAll('.tick text').attr('fill', palette.muted);
    label(svg, 'speed-label', left + (width - right - left) / 2, height - 1,
      'Average road speed (mph)', 'middle').attr('font-size', 11);

    const rows = svg.selectAll('g.bar-row').data(view, d => d.id).join(
      enter => {
        const g = enter.append('g').attr('class', 'bar-row');
        g.append('rect').attr('class', 'row-outline');
        g.append('text').attr('class', 'row-number');
        g.append('text').attr('class', 'stop-from');
        g.append('text').attr('class', 'stop-to');
        g.append('text').attr('class', 'distance');
        g.append('rect').attr('class', 'speed-bar').attr('width', 0);
        g.append('circle').attr('class', 'trip-dot').attr('r', 0);
        g.append('text').attr('class', 'speed-value');
        return g;
      }
    ).attr('data-segment', d => d.id).attr('transform', d => `translate(0,${y(d.id)})`)
      .attr('aria-pressed', d => String(d.id === state.selected));
    rows.attr('opacity', d => state.selected && d.id !== state.selected ? 0.75 : 1);
    rows.select('.row-outline').attr('x', 0).attr('y', -8).attr('width', width)
      .attr('height', rowHeight - 2).attr('rx', 4)
      .attr('fill', d => d.id === state.selected ? palette.selected : 'transparent')
      .attr('stroke', d => d.id === state.selected ? palette.accent : 'transparent').attr('stroke-width', 1.5);
    rows.select('.row-number').attr('x', 8).attr('y', 13).attr('font-size', 11)
      .attr('fill', d => d.id === state.selected ? palette.accent : palette.muted)
      .text((d, i) => String(i + 1).padStart(2, '0'));
    rows.select('.stop-from').attr('x', 38).attr('y', 8).attr('font-size', 13).attr('fill', palette.ink).text(d => d.from);
    rows.select('.stop-to').attr('x', 38).attr('y', 24).attr('font-size', 12).attr('fill', palette.muted).text(d => `→ ${d.to}`);
    rows.select('.distance').attr('x', left - 18).attr('y', 16).attr('text-anchor', 'end')
      .attr('font-size', 10).attr('fill', palette.muted).text(d => `${d.distance.toFixed(2)} mi avg`);
    animate(rows.select('.speed-bar')).attr('x', x(0)).attr('y', 7)
      .attr('height', 12).attr('rx', 2).attr('width', d => d.bar.speed === null ? 0 : x(d.bar.speed) - x(0))
      .attr('fill', d => d.id === state.selected ? palette.ink : palette.bar);
    animate(rows.select('.trip-dot')).attr('cx', d => x(d.bar.speed || 0)).attr('cy', 13)
      .attr('r', d => d.bar.speed === null ? 0 : size(d.bar.trips))
      .attr('fill', d => d.id === state.selected ? palette.accent : palette.ink)
      .attr('stroke', '#fffefa').attr('stroke-width', 1);
    rows.select('.speed-value').attr('x', d => x(d.bar.speed || 0) + 16).attr('y', 17)
      .attr('font-size', 12).attr('font-weight', 600).attr('fill', palette.ink)
      .text(d => d.bar.speed === null ? 'No observations' : fmt(d.bar.speed));
    interactive(rows, d => `Select ${segmentName(d)}`, d => onSegment(d.id), d =>
      `${segmentName(d)}\n${fmt(d.bar.speed)} mph · ${count(d.bar.trips)} observed trips\n${d.distance.toFixed(3)} miles (full-year mean; range ${(d.distanceMin ?? d.distance).toFixed(3)}–${(d.distanceMax ?? d.distance).toFixed(3)}) · ${count(d.bar.records)} source records`);
    return maxTrips;
  }

  function heatmap(host, view, state) {
    const toggle = document.getElementById('heat-show-values');
    const showValues = toggle?.getAttribute('aria-pressed') === 'true';
    d3.select(toggle).text(showValues ? 'Click to hide values' : 'Click to show values')
      .on('click.heatValues', () => {
        toggle.setAttribute('aria-pressed', String(!showValues));
        heatmap(host, view, state);
      });
    d3.select(host).classed('show-heat-values', showValues);
    const width = 640, left = 38, top = 15, right = 7, rowHeight = 34;
    const bottom = top + view.length * rowHeight;
    const svg = chart(host, width, bottom + 52, '24 hourly columns for each segment; drag to select hours');
    const x = d3.scaleBand().domain(d3.range(24)).range([left, width - right]).paddingInner(0.08);
    const y = d3.scaleBand().domain(view.map(d => d.id)).range([top, bottom]).paddingInner(0.09);
    const defs = svg.selectAll('defs.heat-defs').data([null]).join('defs').attr('class', 'heat-defs');
    const pattern = defs.selectAll('pattern').data([null]).join('pattern')
      .attr('id', 'heat-no-observations').attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6).attr('height', 6);
    pattern.selectAll('rect').data([null]).join('rect')
      .attr('width', 6).attr('height', 6).attr('fill', '#ffffff');
    pattern.selectAll('path').data([null]).join('path')
      .attr('d', 'M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5')
      .attr('stroke', '#8a999d').attr('stroke-width', 0.8);
    const lightness = heatColor;
    const rows = svg.selectAll('g.heat-row').data(view, d => d.id).join('g').attr('class', 'heat-row')
      .attr('data-segment', d => d.id).attr('aria-pressed', d => String(d.id === state.selected))
      .attr('opacity', 1);
    rows.each(function(segment, index) {
      const row = d3.select(this);
      const number = row.selectAll('g.row-label').data([segment]).join('g').attr('class', 'row-label');
      number.selectAll('rect').data([segment]).join('rect').attr('x', 0).attr('y', y(segment.id))
        .attr('width', 34).attr('height', y.bandwidth()).attr('fill', 'transparent');
      number.selectAll('text').data([segment]).join('text').attr('x', 15).attr('y', y(segment.id) + 20)
        .attr('text-anchor', 'middle').attr('font-size', 11)
        .attr('fill', segment.id === state.selected ? palette.accent : palette.muted)
        .text(String(index + 1).padStart(2, '0'));
      interactive(number, () => `Select ${segmentName(segment)}`, () => onSegment(segment.id), () => segmentName(segment));
      const cells = row.selectAll('rect.hour-cell').data(segment.hourly.map((value, h) => ({...value, h, segment})), d => d.h)
        .join('rect').attr('class', 'hour-cell').attr('data-hour', d => d.h)
        .attr('x', d => x(d.h)).attr('y', y(segment.id)).attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('rx', 2)
        .attr('fill', d => d.delta === null ? 'url(#heat-no-observations)' : lightness(d.delta))
        .attr('stroke', d => d.delta === null ? '#bdc6c6' : 'none')
        .attr('opacity', 1);
      row.selectAll('text.delta-symbol').remove();
      row.selectAll('text.delta-value')
        .data(showValues ? segment.hourly.map((v,h)=>({...v,h})).filter(d=>Number.isFinite(d.delta)) : [], d=>d.h)
        .join('text').attr('class','delta-value').attr('x',d=>x(d.h)+x.bandwidth()/2)
        .attr('y',y(segment.id)+y.bandwidth()/2).attr('dy','0.35em')
        .attr('text-anchor','middle').attr('font-size',7).attr('font-weight',500)
        .attr('fill',d=>heatTextColor(d.delta)).attr('pointer-events','none')
        .attr('aria-hidden','true')
        .text(d=>d.delta === 0 ? '0%' : Math.abs(d.delta) < 1
          ? (d.delta < 0 ? '−<1%' : '+<1%')
          : (d.delta < 0 ? '−' : '+') + Math.round(Math.abs(d.delta)) + '%');
      // Keyboard users can select a single hour from a cell; controls support ranges.
      interactive(cells, d => `${segmentName(segment)}, ${hour(d.h)}: ${d.speed === null ? 'no observations' : fmt(d.speed) + ' mph, ' + fmt(d.delta) + '% versus baseline'}`,
        d => onHours([d.h, d.h]), d => cellTooltip(d, state));
      row.selectAll('rect.selection-outline').data(segment.id === state.selected ? [segment] : []).join('rect')
        .attr('class', 'selection-outline').attr('x', left - 3).attr('y', y(segment.id) - 2)
        .attr('width', width - left - right + 5).attr('height', y.bandwidth() + 4)
        .attr('fill', 'none').attr('stroke', palette.accent).attr('stroke-width', 2).attr('pointer-events', 'none');
    });
    svg.selectAll('g.hour-axis').data([null]).join('g').attr('class', 'hour-axis')
      .attr('transform', `translate(0,${bottom + 2})`)
      .call(d3.axisBottom(x).tickValues([0, 6, 12, 18, 23]).tickSize(0).tickPadding(10))
      .call(g => g.select('.domain').remove()).call(g => g.selectAll('text').attr('fill', palette.muted));
    label(svg, 'hour-label', left + (width - right - left) / 2, bottom + 45,
      'Hour of day · 24 columns, one per hour', 'middle').attr('font-size', 11);

    // D3 owns the brush gesture and pixel selection. Programmatic restoration
    // must not dispatch another shared-state update (and recurse into render).
    const boundary = d3.scaleLinear().domain([0, 24]).range([left, width - right]);
    const brush = d3.brushX().extent([[left - 1, top - 3], [width - right + 1, bottom + 1]])
      .on('start', hideTooltip)
      .on('end', event => {
        if (restoringBrush || !event.sourceEvent) return;
        if (!event.selection) { onHours(null); return; }
        const [a, b] = event.selection;
        const start = Math.max(0, Math.min(23, Math.floor(boundary.invert(a) + 1e-6)));
        const end = Math.max(start, Math.min(23, Math.ceil(boundary.invert(b) - 1e-6) - 1));
        onHours([start, end]);
      });
    const brushLayer = svg.selectAll('g.hour-brush').data([null]).join('g').attr('class', 'hour-brush').call(brush);
    brushLayer.select('.selection').attr('fill', palette.accent).attr('fill-opacity', 0)
      .attr('stroke', palette.accent).attr('stroke-width', 1.5);
    brushLayer.on('pointermove.tooltip', event => {
      if (event.buttons) { hideTooltip(); return; }
      const [px, py] = d3.pointer(event, svg.node());
      const h = Math.max(0, Math.min(23, Math.floor(boundary.invert(px))));
      const segment = view[Math.floor((py - top) / rowHeight)];
      if (segment) tooltip(event, cellTooltip({...segment.hourly[h], h, segment}, state));
    }).on('pointerleave.tooltip', hideTooltip);
    restoringBrush = true;
    brushLayer.call(brush.move, state.hours ? [boundary(state.hours[0]), boundary(state.hours[1] + 1)] : null);
    restoringBrush = false;
    brushLayer.raise();
  }

  function cellTooltip(d, state) {
    return `${segmentName(d.segment)}\n${hour(d.h)}–${hour(d.h + 1)} · ${state.month ? MONTHS[state.month - 1] : 'All months'}\n${d.speed === null ? 'No observations' : `${fmt(d.speed)} mph · ${d.delta >= 0 ? '+' : ''}${fmt(d.delta)}% vs usual\n${count(d.trips)} observed trips`}\nUsual all-day speed: ${fmt(d.segment.baseline.speed)} mph`;
  }

  function monthly(host, view, state) {
    const width = 570, height = 315, left = 40, right = 22, top = 30, bottom = height - 64;
    const svg = chart(host, width, height, 'Monthly road speeds in mph for all segments');
    const maximum = Math.max(12, Math.ceil(d3.max(view.flatMap(d => d.monthly), d => d.speed) / 2) * 2 || 12);
    const x = d3.scalePoint().domain(d3.range(12)).range([left, width - right]);
    const y = d3.scaleLinear().domain([0, maximum]).range([bottom, top]);
    svg.selectAll('rect.month-highlight').data(state.month ? [state.month - 1] : []).join('rect')
      .attr('class', 'month-highlight').attr('x', d => Math.max(left, x(d) - x.step() / 2))
      .attr('y', top).attr('width', d => d === 0 || d === 11 ? x.step() / 2 : x.step())
      .attr('height', bottom - top).attr('fill', '#f6e9dd').lower();
    const axis = svg.selectAll('g.month-speed-axis').data([null]).join('g').attr('class', 'month-speed-axis')
      .attr('transform', `translate(${left},0)`)
      .call(d3.axisLeft(y).ticks(maximum / 2).tickSize(-(width - right - left)).tickPadding(10));
    axis.select('.domain').remove();
    axis.selectAll('line').attr('stroke', palette.grid).attr('stroke-dasharray', '2 4');
    axis.selectAll('text').attr('fill', palette.muted);
    label(svg, 'mph-label', 6, top - 12, 'mph').attr('font-size', 11);

    // .defined() breaks the path at missing months instead of interpolating gaps.
    const line = d3.line().defined(d => d.speed !== null).x(d => x(d.m)).y(d => y(d.speed));
    const series = svg.selectAll('g.month-series').data(view, d => d.id).join('g')
      .attr('class', 'month-series').attr('data-segment', d => d.id)
      .attr('aria-pressed', d => String(d.id === state.selected));
    series.each(function(segment) {
      const g = d3.select(this), selected = segment.id === state.selected;
      const values = segment.monthly.map((value, m) => ({...value, m}));
      const path = line(values);
      g.selectAll('path.month-line').data([path]).join('path').attr('class', 'month-line')
        .attr('d', d => d).attr('fill', 'none').attr('stroke', selected ? palette.ink : palette.otherLine)
        .attr('stroke-width', selected ? 3 : 1.5).attr('stroke-linejoin', 'round')
        .attr('opacity', state.selected && !selected ? 0.55 : 0.95);
      g.selectAll('path.line-hit').data([path]).join('path').attr('class', 'line-hit')
        .attr('d', d => d).attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 12);
      g.selectAll('circle.month-point').data(values.filter(v => v.speed !== null), d => d.m).join('circle')
        .attr('class', 'month-point').attr('cx', d => x(d.m)).attr('cy', d => y(d.speed))
        .attr('r', selected ? 3.7 : 2.5).attr('fill', selected ? palette.accent : palette.otherLine)
        .on('pointermove.tooltip', (event, value) => {
          event.stopPropagation();
          tooltip(event, `${segmentName(segment)}\n${MONTHS[value.m]} · ${fmt(value.speed)} mph\n${count(value.trips)} observed trips`);
        }).on('pointerleave.tooltip', hideTooltip);
    });
    interactive(series, d => `Select ${segmentName(d)}`, d => onSegment(d.id), segmentName);
    series.filter(d => d.id === state.selected).raise();
    const months = svg.selectAll('g.month-choice').data(MONTHS.map((name, m) => ({name, m})), d => d.m)
      .join('g').attr('class', 'month-choice').attr('aria-pressed', d => String(state.month === d.m + 1));
    months.selectAll('rect').data(d => [d]).join('rect').attr('x', d => x(d.m) - 19).attr('y', bottom + 9)
      .attr('width', 38).attr('height', 29).attr('rx', 4)
      .attr('fill', d => state.month === d.m + 1 ? palette.ink : 'transparent');
    months.selectAll('text').data(d => [d]).join('text').attr('x', d => x(d.m)).attr('y', bottom + 28)
      .attr('text-anchor', 'middle').attr('font-size', 10)
      .attr('fill', d => state.month === d.m + 1 ? 'white' : palette.muted).text(d => d.name);
    interactive(months, d => `Filter to ${d.name}`, d => onMonth(d.m + 1));
    months.raise();
    label(svg, 'month-label', left + (width - right - left) / 2, height - 1, 'Month · 2025', 'middle').attr('font-size', 11);
    svg.selectAll('text.empty-months').data(view.every(d => d.monthly.every(m => m.speed === null)) ? [null] : [])
      .join('text').attr('class', 'empty-months').attr('x', width / 2).attr('y', height / 2)
      .attr('text-anchor', 'middle').attr('fill', palette.muted).attr('font-size', 12)
      .text('No observations for the selected hours');
  }

  return {bars, heatmap, monthly};
}

