const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function monthCoverage(segment) {
  const visible = segment.monthly.flatMap((value, i) => value.speed !== null ? [i + 1] : []);
  const available = segment.monthsAvailable || visible;
  const missingSource = MONTHS.flatMap((_, i) => available.includes(i + 1) ? [] : [i + 1]);
  const filteredOut = available.filter(m => !visible.includes(m));
  return {visible, available, missingSource, filteredOut};
}
const names = months => months.map(m => MONTHS[m - 1]).join(', ');
export function coverageText(view, selected) {
  const segment = view.find(s => s.id === selected);
  if (!segment) {
    const partial = view.filter(s => monthCoverage(s).visible.length < 12).length;
    return `${partial} of ${view.length} segments have fewer than 12 observed months under the current weekday/hour filters. Select a segment to inspect coverage. Gaps mean no matching observations; one dot means one observed month. Different endpoints remain separate even if stop names are similar.`;
  }
  const {visible, missingSource, filteredOut} = monthCoverage(segment);
  return `${segment.from} → ${segment.to}. ${visible.length}/12 months observed: ${visible.length ? names(visible) : 'none'}. ` +
    (missingSource.length ? `Absent from the prepared data: ${names(missingSource)}. ` : 'All 12 months are present in the prepared data. ') +
    (filteredOut.length ? `Additional gaps under current weekday/hour filters: ${names(filteredOut)}. ` : '') +
    'Missing observations do not establish that the bus did not operate. Lines do not bridge gaps.';
}

export function monthStatuses(segment) {
  const {visible, available} = monthCoverage(segment);
  return MONTHS.map((month, i) => ({month,
    status: visible.includes(i + 1) ? 'observed' : available.includes(i + 1) ? 'filtered' : 'absent'}));
}
export const STATUS_LABELS = {
  observed: 'Observations available',
  absent: 'No observations in dataset',
  filtered: 'No matches under current filters'
};
export function renderCoverage(view, selected, root = document) {
  const segment = view.find(s => s.id === selected);
  const summary = root.querySelector('#month-coverage');
  const details = root.querySelector('#coverage-details');
  const strip = root.querySelector('#month-availability');
  strip.replaceChildren();
  const breakdown = root.querySelector('.coverage-breakdown');
  if (breakdown && breakdown.dataset.segment !== String(selected)) {
    breakdown.open = false;
    breakdown.dataset.segment = String(selected);
  }
  details.hidden = !segment;
  if (!segment) {
    const partial = view.filter(s => monthCoverage(s).visible.length < 12).length;
    summary.textContent = `${partial} of ${view.length} segments have fewer than 12 observed months under current weekday/hour filters. Select a segment to see which months are available.`;
    return;
  }
  const {visible, missingSource, filteredOut} = monthCoverage(segment);
  const missing = [];
  if (missingSource.length) missing.push('No data: ' + names(missingSource));
  if (filteredOut.length) missing.push('No filter matches: ' + names(filteredOut));
  summary.textContent = (missing.length ? missing.join(' · ') + '. ' : 'No missing months. ') +
    `${visible.length}/12 months observed.`;
  for (const {month, status} of monthStatuses(segment)) {
    const item = root.createElement('li');
    item.className = 'availability-month';
    item.setAttribute('aria-label', `${month}: ${STATUS_LABELS[status]}`);
    const mark = root.createElement('span');
    mark.className = `availability-mark ${status}`;
    mark.setAttribute('aria-hidden', 'true');
    const label = root.createElement('span');
    label.textContent = month;
    label.setAttribute('aria-hidden', 'true');
    item.append(mark, label);
    strip.append(item);
  }
}
export function setupMonthlyHelp(root = document) {
  const button = root.querySelector('#month-info');
  const explanation = root.querySelector('#month-help');
  function setOpen(open) {
    explanation.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }
  button.addEventListener('click', () => setOpen(explanation.hidden));
  root.querySelector('.month-panel').addEventListener('keydown', event => {
    if (event.key === 'Escape' && !explanation.hidden) {
      setOpen(false);
      button.focus();
      event.stopPropagation();
    }
  });
}
