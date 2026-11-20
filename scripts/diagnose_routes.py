"""Extract representative conflicts from all failed routes without modifying data."""
import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

BASE = ['Route ID','Direction','Timepoint Stop ID','Next Timepoint Stop ID','Stop Order']
META = ['Stop Order','Road Distance','Timepoint Stop Name','Next Timepoint Stop Name',
        'Timepoint Stop Latitude','Timepoint Stop Longitude',
        'Next Timepoint Stop Latitude','Next Timepoint Stop Longitude']
TIME = ['Month','Day of Week','Hour of Day']

def key(row, fields):
    return tuple(row.get(f, '') for f in fields)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path)
    p.add_argument('report',type=Path)
    p.add_argument('--output',type=Path,default=Path('route-conflicts.csv'))
    a=p.parse_args()
    if a.output.exists():
        p.error('Output already exists; use a different --output filename.')
    report=json.loads(a.report.read_text())
    failures={x['route']:x for x in report['failedRoutes']}
    targets={r:int(re.search(r'CSV line (\d+)',x['reason']).group(1)) for r,x in failures.items()}
    counters=Counter(); selected={}
    print('Pass 1/2: locating reported conflicts...',flush=True)
    with a.source.open(newline='',encoding='utf-8-sig') as f:
        reader=csv.DictReader(f);headers=reader.fieldnames
        for row in reader:
            route=row['Route ID']
            if route not in targets or row['Year']!=str(report['year']) or row['Route Type']!=report['service']:
                continue
            counters[route]+=1
            if counters[route]+1==targets[route]:selected[route]=row
    if len(selected)!=len(targets):
        raise ValueError('Some reported rows were not found. Use the CSV that generated this report.')
    print('Pass 2/2: collecting differing metadata and repeated time groups...',flush=True)
    signatures={r:set() for r in selected}; counts=Counter(); emitted=set();total=0
    with a.source.open(newline='',encoding='utf-8-sig') as f, a.output.open('w',newline='',encoding='utf-8') as out:
        writer=csv.DictWriter(out,fieldnames=['Diagnostic','Source CSV Line']+headers)
        writer.writeheader()
        for line,row in enumerate(csv.DictReader(f),2):
            route=row['Route ID'];target=selected.get(route)
            if target is None or row['Year']!=str(report['year']) or row['Route Type']!=report['service'] or key(row,BASE)!=key(target,BASE):continue
            signature=key(row,META)
            same_time=key(row,TIME)==key(target,TIME)
            full=tuple(row.get(h,'') for h in headers)
            # Retain all records in the failing time group, including exact duplicates.
            # Otherwise retain one representative per distinct metadata combination.
            if same_time or signature not in signatures[route]:
                writer.writerow({'Diagnostic':'reported time group' if same_time else 'metadata variant',
                                 'Source CSV Line':line,**row})
                total+=1;counts[route]+=1
            signatures[route].add(signature)
    print(f'Saved {total:,} diagnostic rows for {len(counts)} routes to {a.output}')
    print('Upload this small CSV. Original files and prepared data were not modified.')

if __name__=='__main__':main()
