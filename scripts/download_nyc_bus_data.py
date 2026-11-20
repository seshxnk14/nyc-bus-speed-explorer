#!/usr/bin/env python3
"""Download all five NYC boroughs, 2025 Local bus segment speeds.
Python 3 standard library only. Run again with identical arguments to resume.
"""
import argparse
import csv
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = 'https://data.ny.gov'
DATASET = 'kufs-yh3x'
BOROUGHS = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island']


def request_json(url, params=None):
    if params:
        url += '?' + urlencode(params)
    headers = {'Accept': 'application/json', 'User-Agent': 'NYCBusResearchDownloader/1.0'}
    if os.environ.get('SOCRATA_APP_TOKEN'):
        headers['X-App-Token'] = os.environ['SOCRATA_APP_TOKEN']
    for attempt in range(6):
        try:
            with urlopen(Request(url, headers=headers), timeout=120) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504):
                detail = error.read(1500).decode('utf-8', errors='replace')
                raise RuntimeError(f'HTTP {error.code}: {detail}') from error
            reason = f'HTTP {error.code}'
        except (URLError, TimeoutError, ConnectionError) as error:
            reason = str(error)
        if attempt == 5:
            raise RuntimeError(f'Request failed after six attempts: {reason}')
        delay = min(2 ** (attempt + 1), 30)
        print(f'{reason}; retrying in {delay}s...', flush=True)
        time.sleep(delay)


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def source_signature(metadata):
    return {key: metadata.get(key) for key in
            ('id', 'rowsUpdatedAt', 'viewLastModified', 'publicationDate')}


def cell(value):
    if value is None:
        return ''
    if isinstance(value, dict) and value.get('type') == 'Point':
        return 'POINT (' + ' '.join(map(str, value['coordinates'])) + ')'
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(',', ':'))
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('NYC-Local-2025.csv'))
    parser.add_argument('--batch-size', type=int, default=5000)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 50000:
        parser.error('--batch-size must be between 1 and 50000')
    endpoint = f'{BASE}/resource/{DATASET}.json'
    metadata_url = f'{BASE}/api/views/{DATASET}.json'
    metadata = request_json(metadata_url)
    columns = [c for c in metadata['columns'] if not c['fieldName'].startswith(':')]
    by_name = {c['name'].strip().casefold(): c for c in columns}
    def field(name):
        if name.casefold() not in by_name:
            raise RuntimeError(f'Required column missing from API metadata: {name}')
        return by_name[name.casefold()]['fieldName']
    year_column = by_name.get('year', {})
    year_value = '2025' if year_column.get('dataTypeName') == 'number' else quote('2025')
    where = (f"{field('Year')} = {year_value} AND {field('Route Type')} = 'Local' "
             f"AND {field('Borough')} in ({','.join(map(quote, BOROUGHS))})")
    def count():
        result = request_json(endpoint, {'$select': 'count(*) as total', '$where': where})
        return int(result[0]['total'])
    total = count()
    if not total:
        raise RuntimeError('No matching rows. Check the source borough/service values.')
    signature = source_signature(metadata)
    if signature['rowsUpdatedAt'] is None:
        raise RuntimeError('Source has no update timestamp; cannot safely resume.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    cache = args.output.parent / (args.output.name + '.parts')
    cache.mkdir(exist_ok=True)
    state_file = cache / 'progress.json'
    identity = {'dataset': DATASET, 'where': where, 'source': signature,
                'total': total, 'columns': [(c['name'], c['fieldName']) for c in columns]}
    # JSON normalizes tuples to lists for comparison after a restart.
    identity = json.loads(json.dumps(identity))
    if state_file.exists():
        state = json.loads(state_file.read_text(encoding='utf-8'))
        if state['identity'] != identity:
            raise RuntimeError('Source changed since download started. Use a new --output filename to restart safely.')
    else:
        state = {'identity': identity, 'downloaded': 0, 'pages': 0}
        save_json(state_file, state)
    print(f"Matching rows: {total:,}. Already saved: {state['downloaded']:,}.", flush=True)
    while state['downloaded'] < total:
        page = request_json(endpoint, {
            '$select': '*, :id as download_row_id', '$where': where,
            '$order': ':id', '$limit': min(args.batch_size, total - state['downloaded']),
            '$offset': state['downloaded'],
        })
        if not isinstance(page, list) or not page:
            raise RuntimeError('Unexpected empty response before the expected row count.')
        if any('download_row_id' not in row for row in page):
            raise RuntimeError('API did not return row IDs; cannot validate pagination.')
        save_json(cache / f"page-{state['pages']:06d}.json", page)
        state['downloaded'] += len(page)
        state['pages'] += 1
        save_json(state_file, state)
        print(f"Saved {state['downloaded']:,} / {total:,} rows ({100 * state['downloaded'] / total:.1f}%).", flush=True)
        time.sleep(0.2)
    if source_signature(request_json(metadata_url)) != signature or count() != total:
        raise RuntimeError('Source changed during download. Use a new --output filename and restart.')
    temporary = args.output.with_suffix(args.output.suffix + '.tmp')
    seen, borough_counts = set(), {}
    with temporary.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow([c['name'] for c in columns])
        for index in range(state['pages']):
            page = json.loads((cache / f'page-{index:06d}.json').read_text(encoding='utf-8'))
            for row in page:
                rid = row['download_row_id']
                if rid in seen:
                    raise RuntimeError('Duplicate API row ID detected; final CSV was not replaced.')
                seen.add(rid)
                borough = row.get(field('Borough'))
                if (borough not in BOROUGHS or str(row.get(field('Year'))) != '2025'
                        or row.get(field('Route Type')) != 'Local'):
                    raise RuntimeError('A returned row does not match the requested filters.')
                borough_counts[borough] = borough_counts.get(borough, 0) + 1
                writer.writerow([cell(row.get(c['fieldName'])) for c in columns])
    if len(seen) != total:
        raise RuntimeError('Final row count mismatch; final CSV was not replaced.')
    if set(borough_counts) != set(BOROUGHS):
        raise RuntimeError(f'Not all five boroughs are represented: {borough_counts}')
    temporary.replace(args.output)
    print(f'Complete: {args.output.resolve()} ({total:,} unique source rows)')
    for borough in BOROUGHS:
        print(f'  {borough}: {borough_counts[borough]:,}')
    print(f'Progress files retained in {cache}. Keep them until you verify the CSV.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nPaused. Run the same command to resume.', file=sys.stderr)
        sys.exit(130)
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(f'\nDownload stopped: {error}\nSaved batches are retained.', file=sys.stderr)
        sys.exit(1)
