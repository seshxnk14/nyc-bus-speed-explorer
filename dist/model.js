
export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Pool trip-weighted distance/time; a missing group is null, never zero mph. */
export function aggregate(rows) {
  let trips = 0, miles = 0, minutes = 0;
  for (const row of rows) {
    trips += row[4]; miles += row[5]; minutes += row[6];
  }
  return {trips, miles, minutes, speed: minutes > 0 ? 60 * miles / minutes : null, records: rows.length};
}

const rowIndexes = new WeakMap();
function indexRows(data) {
  if (rowIndexes.has(data)) return rowIndexes.get(data);
  const index = new Map();
  const directions = new Map(data.segments.map(s => [s.id, s.direction]));
  for (const row of data.rows) {
    const direction = directions.get(row[0]);
    for (const key of [direction + ':all', direction + ':' + row[2]]) {
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    }
  }
  rowIndexes.set(data, index);
  return index;
}

export function compute(data, state) {
  const segments = data.segments.filter(segment => segment.direction === state.direction);
  const rows = indexRows(data).get(state.direction + ':' + state.day) || [];
  const empty = () => ({trips: 0, miles: 0, minutes: 0, records: 0});
  const totals = new Map(segments.map(segment => [segment.id, {
    baseline: empty(), bar: empty(),
    hourly: Array.from({length: 24}, empty),
    monthly: Array.from({length: 12}, empty)
  }]));
  const add = (target, row) => {
    target.trips += row[4]; target.miles += row[5];
    target.minutes += row[6]; target.records++;
  };
  const finish = value => ({...value,
    speed: value.minutes > 0 ? 60 * value.miles / value.minutes : null});


  for (const row of rows) {
    const target = totals.get(row[0]);
    if (!target) continue;
    const inHour = !state.hours || row[3] >= state.hours[0] && row[3] <= state.hours[1];
    const inMonth = state.month === null || row[1] === state.month;
    add(target.baseline, row);
    if (inHour && inMonth) add(target.bar, row);
    if (inMonth) add(target.hourly[row[3]], row);
    if (inHour) add(target.monthly[row[1] - 1], row);
  }
  return segments.map(segment => {
    const target = totals.get(segment.id);
    const baseline = finish(target.baseline);
    return {...segment, baseline, bar: finish(target.bar),
      hourly: target.hourly.map(total => {
        const value = finish(total);
        return {...value, delta: value.speed !== null && baseline.speed > 0
          ? 100 * (value.speed - baseline.speed) / baseline.speed : null};
      }),
      monthly: target.monthly.map(finish)
    };
  });
}


export function radius(trips, maxTrips, maxRadius = 10) {
  return maxTrips > 0 ? maxRadius * Math.sqrt(trips / maxTrips) : 0;
}


export function initialState() {
  return {direction: 'E', day: 'all', month: null, hours: null, selected: null};
}
export function reduceState(state, action) {
  switch (action.type) {
    case 'reset': return {...initialState(), direction: state.direction};
    case 'direction': return {...state, direction: action.value, selected: null};
    case 'day': return {...state, day: action.value};
    case 'segment': return {...state, selected: state.selected === action.value ? null : action.value};
    case 'month': return {...state, month: state.month === action.value ? null : action.value};
    case 'hours': {
      const hours = action.value ? [...action.value].sort((a, b) => a - b).map(h => Math.max(0, Math.min(23, h))) : null;
      return {...state, hours};
    }
    case 'clear': return ['hours', 'month', 'selected'].includes(action.key) ? {...state, [action.key]: null} : state;
    default: return state;
  }
}

