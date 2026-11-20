"""Stream a large NYC CSV into per-route dashboard files; Python 3 only."""
import sys
import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
FIELDS = ['segment', 'month', 'weekdayIndex', 'hour', 'trips', 'tripMiles', 'tripMinutes']
REQUIRED = ['Year', 'Month', 'Day of Week', 'Hour of Day', 'Route ID', 'Route Type',
            'Direction', 'Borough', 'Stop Order', 'Timepoint Stop ID',
            'Next Timepoint Stop ID', 'Timepoint Stop Name', 'Next Timepoint Stop Name',
            'Bus Trip Count', 'Road Distance', 'Average Travel Time']


def positive(value, field):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError(f'{field} must be finite and positive')
    return number


def coordinates(row, prefix):
    lat = row.get(prefix + ' Latitude', '').strip()
    lon = row.get(prefix + ' Longitude', '').strip()
    if not lat and not lon:
        return None
    lat, lon = float(lat), float(lon)
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError('Invalid stop coordinates')
    return [lon, lat]


def prepare(source, *, route, year, service='Local', quarantine=None):
    source = Path(source)
    segments, records, keys = {}, [], set()
    distance_totals = {}
    time_keys = set()
    repeated_time_rows = 0
    exclusions, boroughs = Counter(), set()
    input_rows = 0
    with source.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        missing = set(REQUIRED) - set(reader.fieldnames or [])
        if missing:
            raise ValueError('Missing columns: ' + ', '.join(sorted(missing)))
        for line, row in enumerate(reader, start=2):
            input_rows += 1
            if row['Year'] != str(year):
                exclusions['otherYear'] += 1
                continue
            if row['Route ID'] != route:
                exclusions['otherRoute'] += 1
                continue
            if row['Route Type'] != service:
                exclusions['otherService'] += 1
                continue
            try:
                positive(row['Road Distance'], 'Road Distance')
                positive(row['Average Travel Time'], 'Average Travel Time')
                positive(int(row['Bus Trip Count']), 'Bus Trip Count')
            except (ValueError, OverflowError) as error:
                if quarantine is None:
                    raise ValueError(f'CSV line {line}: {error}') from error
                quarantine(row, line, str(error))
                exclusions['invalidNumericRows'] += 1
                continue
            try:
                direction = row['Direction'].strip()
                start, end = row['Timepoint Stop ID'].strip(), row['Next Timepoint Stop ID'].strip()
                if not direction or not start or not end:
                    raise ValueError('Direction and endpoint IDs must be present')
                order = int(row['Stop Order'])
                sid = f'{direction}-{start}-{end}-o{order}'
                month, hour = int(row['Month']), int(row['Hour of Day'])
                day = DAYS.index(row['Day of Week'])
                if not 1 <= month <= 12 or not 0 <= hour <= 23:
                    raise ValueError('Month or hour outside valid range')
                trips = int(row['Bus Trip Count'])
                positive(trips, 'Bus Trip Count')
                distance = positive(row['Road Distance'], 'Road Distance')
                minutes = positive(row['Average Travel Time'], 'Average Travel Time')
                # Preserve source precision: even tiny distance differences can
                # identify distinct source groups. Do not round or deduplicate them.
                from decimal import Decimal
                key = (sid, month, day, hour, Decimal(row['Road Distance']))
                if key in keys:
                    raise ValueError(f'Ambiguous repeated group including road distance: {key}')
                time_key = (sid, month, day, hour)
                if time_key in time_keys:
                    repeated_time_rows += 1
                time_keys.add(time_key)
                trip_miles, trip_minutes = distance * trips, minutes * trips
                positive(trip_miles, 'Weighted distance')
                positive(trip_minutes, 'Weighted minutes')
                segment = {
                    'id': sid, 'direction': direction, 'order': int(row['Stop Order']),
                    'from': row['Timepoint Stop Name'], 'to': row['Next Timepoint Stop Name'],
                    'distance': distance, 'sourceStopOrder': order,
                    'endpointPair': f'{direction}-{start}-{end}',
                    'fromCoordinates': coordinates(row, 'Timepoint Stop'),
                    'toCoordinates': coordinates(row, 'Next Timepoint Stop'),
                }
                if sid in segments:
                    changed = [f for f in segment if f != 'distance' and segment[f] != segments[sid][f]]
                    if changed:
                        raise ValueError(f'Segment metadata changes in {changed}: {sid}')
                stats = distance_totals.setdefault(sid, {'miles': 0.0, 'trips': 0, 'values': set()})
                stats['miles'] += trip_miles
                stats['trips'] += trips
                stats['values'].add(distance)
                segments[sid] = segment
                keys.add(key)
                boroughs.add(row['Borough'])
                records.append([sid, month, day, hour, trips, trip_miles, trip_minutes])
            except (ValueError, OverflowError) as error:
                raise ValueError(f'CSV line {line}: {error}') from error
    if not records:
        raise ValueError(f'No records match {year}, {route}, {service}')
    for sid, segment in segments.items():
        stats = distance_totals[sid]
        segment['distance'] = stats['miles'] / stats['trips'] if len(stats['values']) > 1 else next(iter(stats['values']))
        segment['distanceMin'] = min(stats['values'])
        segment['distanceMax'] = max(stats['values'])
        segment['distanceVariants'] = len(stats['values'])
    return {
        'meta': {
            'source': 'https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds-Beginning-2025/kufs-yh3x',
            'sourceFile': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'inputRows': input_rows, 'rows': len(records),
            'excludedRows': sum(exclusions.values()), 'exclusions': dict(exclusions),
            'year': year, 'route': route, 'service': service,
            'boroughs': sorted(boroughs), 'fields': FIELDS,
            'segmentIdentity': 'direction + endpoint IDs + stop order',
            'distancePolicy': 'Source records retained separately, each using its own distance for tripMiles. Segment distance is a full-extract trip-weighted mean, not a fixed length.',
            'repeatedTimeRowsWithDistinctDistances': repeated_time_rows,
            'segmentsWithVaryingDistance': sum(len(v['values']) > 1 for v in distance_totals.values()),
            'sourceGroupAssumption': 'Distinct source distance groups are treated as additive observations; no claim is made about unique vehicle trips across groups.',
            'orderingNote': 'Source stop-order positions are preserved separately; this does not establish a single continuous route pattern.',
        },
        'segments': sorted(segments.values(), key=lambda s: (s['direction'], s['order'], s['id'])),
        'rows': records,
    }



def main():
    import sqlite3
    import tempfile
    import time
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('dist/nyc-data'))
    parser.add_argument('--year', type=int, default=2025)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists. Choose a new --output folder; existing files will not be overwritten.')
    args.output.mkdir(parents=True)
    started = time.monotonic()
    report = {'year': args.year, 'service': 'Local', 'sourceFile': args.source.name,
              'inputRows': 0, 'selectedRows': 0, 'excluded': {}, 'routes': [], 'failedRoutes': [], 'quarantinedRows': 0, 'quarantineReasons': {}}
    def write(name, value):
        (args.output / name).write_text(json.dumps(value, indent=2, allow_nan=False), encoding='utf-8')
    try:
        print('Fingerprinting source CSV...', flush=True)
        digest = hashlib.sha256()
        with args.source.open('rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(chunk)
        report['sourceSha256'] = digest.hexdigest()
        # Disk-backed staging avoids keeping all source rows in memory or opening
        # hundreds of route files simultaneously. Temporary files are removed on exit.
        with tempfile.TemporaryDirectory(prefix='nyc-stage-', dir=args.output) as tmp:
            db = sqlite3.connect(str(Path(tmp) / 'rows.sqlite'))
            try:
                db.execute('CREATE TABLE records (route TEXT, line INTEGER, payload TEXT)')
                with args.source.open(encoding='utf-8-sig', newline='') as handle:
                    reader = csv.DictReader(handle)
                    headers = reader.fieldnames or []
                    missing = set(REQUIRED) - set(headers)
                    if missing:
                        raise ValueError('Missing columns: ' + ', '.join(sorted(missing)))
                    pending = []
                    for line, row in enumerate(reader, start=2):
                        report['inputRows'] += 1
                        reason = ('otherYear' if row['Year'] != str(args.year) else
                                  'otherService' if row['Route Type'] != 'Local' else None)
                        if reason:
                            report['excluded'][reason] = report['excluded'].get(reason, 0) + 1
                            continue
                        if not row['Route ID'].strip():
                            raise ValueError(f'Source line {line}: missing Route ID')
                        pending.append((row['Route ID'], line, json.dumps(row)))
                        report['selectedRows'] += 1
                        if len(pending) >= 10000:
                            db.executemany('INSERT INTO records VALUES (?,?,?)', pending)
                            pending.clear()
                        if report['inputRows'] % 100000 == 0:
                            db.commit()
                            print(f"Read {report['inputRows']:,} source rows...", flush=True)
                    db.executemany('INSERT INTO records VALUES (?,?,?)', pending)
                    db.commit()
                if not report['selectedRows']:
                    raise ValueError('No matching Local records for the selected year')
                print('Indexing routes on disk...', flush=True)
                db.execute('CREATE INDEX route_index ON records(route,line)')
                routes = [r[0] for r in db.execute('SELECT DISTINCT route FROM records ORDER BY route')]
                (args.output / 'routes').mkdir()
                for index, route in enumerate(routes, 1):
                    staging = Path(tmp) / 'route.csv'
                    with staging.open('w', encoding='utf-8', newline='') as handle:
                        writer = csv.DictWriter(handle, fieldnames=headers)
                        writer.writeheader()
                        for (payload,) in db.execute('SELECT payload FROM records WHERE route=? ORDER BY line', (route,)):
                            writer.writerow(json.loads(payload))
                    print(f'Preparing {index}/{len(routes)}: {route}', flush=True)
                    try:
                        def quarantine(row, line, reason):
                            log = args.output / 'quarantined-rows.csv'
                            first = not log.exists()
                            with log.open('a', encoding='utf-8', newline='') as handle:
                                writer = csv.DictWriter(handle, fieldnames=['Route Extract Line', 'Reason'] + headers)
                                if first:
                                    writer.writeheader()
                                writer.writerow({'Route Extract Line': line, 'Reason': reason, **row})
                            report['quarantinedRows'] += 1
                            report['quarantineReasons'][reason] = report['quarantineReasons'].get(reason, 0) + 1
                        payload = prepare(staging, route=route, year=args.year, quarantine=quarantine)
                    except ValueError as error:
                        report['failedRoutes'].append({'route': route, 'reason': str(error),
                            'note': 'Line numbers refer to the route-only extract. No file published for this route.'})
                        continue
                    # Hex encoding is collision-free and safe for filenames.
                    filename = 'routes/route-' + route.encode('utf-8').hex() + '.json'
                    payload['meta']['sourceFile'] = args.source.name
                    payload['meta']['sha256'] = report['sourceSha256']
                    payload['meta']['inputRowsScope'] = 'route-only extract'
                    (args.output / filename).write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False), encoding='utf-8')
                    entry = {'route': route, 'file': filename, 'rows': len(payload['rows']),
                             'quarantinedRows': payload['meta']['exclusions'].get('invalidNumericRows', 0),
                             'segments': len(payload['segments']), 'boroughs': payload['meta']['boroughs'],
                             'directions': sorted({s['direction'] for s in payload['segments']}),
                             'segmentsWithVaryingDistance': payload['meta']['segmentsWithVaryingDistance'],
                             'repeatedTimeRowsWithDistinctDistances': payload['meta']['repeatedTimeRowsWithDistinctDistances']}
                    report['routes'].append(entry)
            finally:
                db.close()
        report['preparedRows'] = sum(r['rows'] for r in report['routes'])
        report['unpreparedRows'] = report['selectedRows'] - report['preparedRows']
        report['failedRouteValidRows'] = report['unpreparedRows'] - report['quarantinedRows']
        report['seconds'] = round(time.monotonic() - started, 1)
        report['status'] = 'needs-review' if report['failedRoutes'] else ('complete-with-exclusions' if report['quarantinedRows'] else 'complete')
        write('catalog.json', {'year': args.year, 'service': 'Local', 'status': report['status'],
                              'routes': report['routes']})
        write('preparation-report.json', report)
        print(f"Prepared {len(report['routes'])} routes, {report['preparedRows']:,} records. "
              f"Routes needing review: {len(report['failedRoutes'])}. Quarantined rows: {report['quarantinedRows']}.")
        print(f"Report: {args.output / 'preparation-report.json'}")
        return 2 if report['failedRoutes'] else 0
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = str(error)
        write('preparation-report.json', report)
        raise


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, csv.Error) as error:
        print(f'Preparation stopped: {error}', file=sys.stderr)
        sys.exit(1)
