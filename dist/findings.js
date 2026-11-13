
const speed = value => value.toFixed(1);
const hour = value => String(value).padStart(2, '0') + ':00';

export function findings(view, state) {
  let slowest = null;
  view.forEach((segment, i) => {
    if (segment.bar.speed !== null && (!slowest || segment.bar.speed < slowest.value)) {
      slowest = {index: i, value: segment.bar.speed};
    }
  });
  const bar = slowest
    ? `Slowest: Segment ${slowest.index + 1} · ${speed(slowest.value)} mph`
    : 'No observations for the current month and hour selection.';

  let minimum = null;
  view.forEach((segment, i) => {
    if (state.selected && segment.id !== state.selected) return;
    segment.hourly.forEach((value, h) => {
      if (value.delta !== null && (!minimum || value.delta < minimum.delta)) {
        minimum = {index: i, h, delta: value.delta};
      }
    });
  });
  let heat = 'No hourly observations for this selection.';
  if (minimum) {
    const location = `Segment ${minimum.index + 1} · ${hour(minimum.h)}–${hour(minimum.h + 1)}`;
    const difference = Math.abs(minimum.delta).toFixed(1);
    heat = minimum.delta < 0
      ? `Biggest slowdown: ${location} · ${difference}% below usual`
      : minimum.delta > 0
        ? `Smallest relative gain: ${location} · ${difference}% above usual`
        : `Closest to usual: ${location} · at the annual all-day speed`;
  }

  const candidates = view.map((segment, i) => {
    const values = segment.monthly.map(value => value.speed).filter(value => value !== null);
    return {id: segment.id, index: i, count: values.length,
      min: Math.min(...values), max: Math.max(...values)};
  });
  let chosen = state.selected ? candidates.find(candidate => candidate.id === state.selected) : null;
  if (!state.selected) {
    for (const candidate of candidates) {
      if (candidate.count >= 2 && (!chosen || candidate.max - candidate.min > chosen.max - chosen.min)) chosen = candidate;
    }
  }
  let month = 'No segment has observations in at least two months for these hours.';
  if (chosen?.count >= 2) {
    month = `${state.selected ? 'Selected' : 'Largest monthly range:'} Segment ${chosen.index + 1} · ${speed(chosen.min)}–${speed(chosen.max)} mph across ${chosen.count} months`;
  } else if (chosen?.count === 1) {
    month = `Segment ${chosen.index + 1} · ${speed(chosen.min)} mph · only one month observed`;
  } else if (state.selected) {
    month = 'No monthly observations for the selected segment and hours.';
  }
  return {bar, heat, month};
}
