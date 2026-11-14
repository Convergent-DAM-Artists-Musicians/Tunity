"""Controlled perturbations of real recorded sound. Not new human performances."""
import json,sys
from pathlib import Path
import numpy as np,soundfile as sf
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'python'))
from rhythm_worker import detect
from onsets import metric

def make():
    source,sr=sf.read(ROOT/'data/05.wav');source=source[:int(7.85*sr)]
    truth=json.loads((ROOT/'data/05.truth.json').read_text())[:14]
    # Preserve known acoustic timing as the reference, with original measure IDs.
    beat_score=json.loads((ROOT/'data/05.score.json').read_text())
    events=[];end=0
    for n in truth:
        if n['startSec']>end+.001:events.append(dict(id='r-'+n['id'],kind='rest',startBeat=end,durationBeats=n['startSec']-end,measure='review',beat=1))
        e=next(e for e in beat_score['events'] if e['id']==n['id'])
        events.append(dict(id=n['id'],kind='note',startBeat=n['startSec'],durationBeats=n['endSec']-n['startSec'],measure=e['measure'],beat=e['beat'],midi=n['midi']))
        end=n['endSec']
    score=dict(events=events,tempoMap=[dict(beat=0,bpm=60)],meterMap=[dict(beat=0,numerator=4,denominator=4)])
    rows=[]
    for kind in ['clean','early','late','missing_note','extra_note','incorrect_duration']:
        y=source.copy();target=None;expected=[];t=[dict(n) for n in truth]
        if kind in ['early','late']:
            n=truth[13];target=n['id'];a,b=int(n['startSec']*sr),int(n['endSec']*sr)
            delta=-.13 if kind=='early' else .13;segment=y[a:b].copy();y[a:b]=0
            dest=a+int(delta*sr)
            # Moving early truncates the previous note by only ~40 ms.
            y[dest:dest+len(segment)]=segment
            t[13]['startSec']+=delta;t[13]['endSec']+=delta
            if kind=='early':t[12]['endSec']=min(t[12]['endSec'],t[13]['startSec'])
            expected=[dict(kind=kind,expectedId=target)]
            if kind=='early':expected.append(dict(kind='misplaced_rest',expectedId='r-n13'))
        if kind=='missing_note':
            n=truth[3];target=n['id'];y[int(n['startSec']*sr):int(n['endSec']*sr)+100]=0;t.pop(3)
            expected=[dict(kind=kind,expectedId=target)]
        if kind=='incorrect_duration':
            n=truth[3];target=n['id'];cut=n['startSec']+.16;y[int(cut*sr):int(n['endSec']*sr)+100]=0;t[3]['endSec']=cut
            expected=[dict(kind=kind,expectedId=target)]
        if kind=='extra_note':
            n=truth[0];segment=source[int(n['startSec']*sr):int(n['endSec']*sr)].copy();a=int(4.3*sr);y[a:a+len(segment)]=segment
            t.append(dict(id='added',startSec=4.3,endSec=4.3+len(segment)/sr,midi=n['midi']));t.sort(key=lambda n:n['startSec'])
            expected=[dict(kind='extra_note',expectedId=None),dict(kind='misplaced_rest',expectedId='r-n6')]
        d=detect(y);sf.write(ROOT/'data'/f'real-edit-{kind}.wav',y,sr,subtype='FLOAT')
        rows.append(dict(id='real-'+kind,score=score,notes=d['notes'],truth=t,expected=expected,options=dict(alignmentMode='fixed'),durationSec=len(y)/sr,onsets=metric([n['startSec'] for n in t],[n['startSec'] for n in d['notes']])))
    (ROOT/'data/real-controls.json').write_text(json.dumps(rows,indent=2))
if __name__=='__main__':make()
