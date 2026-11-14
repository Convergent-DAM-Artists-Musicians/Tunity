"""Deterministic waveform controls, including notes with no amplitude reattack.
These are supplementary tests, explicitly not real trumpet performances.
"""
import json
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'python'))
from rhythm_worker import detect
from onsets import metric
SR=16000

def render(notes,seconds):
    y=np.zeros(int(seconds*SR));rng=np.random.default_rng(1729)
    for n in notes:
        a,b=int(n['startSec']*SR),int(n['endSec']*SR);t=np.arange(b-a)/SR
        f=440*2**((n['midi']-69)/12)
        phase=2*np.pi*f*t+.12*np.sin(2*np.pi*5*t)
        signal=sum(np.sin(h*phase)/h**1.1 for h in range(1,9))
        envelope=np.ones(len(t))
        attack=min(len(t),int(.012*SR));release=min(len(t),int(.012*SR))
        envelope[:attack]=np.linspace(0,1,attack);envelope[-release:]=np.linspace(1,0,release)
        envelope*=.12*(1+.15*np.sin(2*np.pi*2*t))
        y[a:b]+=signal*envelope
    return y+rng.normal(0,1e-5,len(y))

def make():
    cases=[]
    # Several tempi with repeated pitches, 16ths, dotted notes, tuplets, ties and rests.
    for bpm in [72,120,180]:
        durations=[1,1,.5,.5,.25,.25,.25,.25,1.5,.5,1/3,1/3,1/3,2,1]
        events=[];beat=0
        for i,duration in enumerate(durations):
            events.append(dict(id=f'n{i}',kind='note',startBeat=beat,durationBeats=duration,measure=str(int(beat//4)+1),beat=beat%4+1,midi=60+(i//2)%5))
            beat+=duration
            if i==8:
                events.append(dict(id='rest',kind='rest',startBeat=beat,durationBeats=.5,measure=str(int(beat//4)+1),beat=beat%4+1));beat+=.5
        for e in events:
            if e['id'] in ['n10','n11','n12']:e['notation']={'type':'eighth','actualNotes':3,'normalNotes':2}
            if e['id']=='n8':e['notation']={'type':'quarter','dots':1}
            if e['id']=='n13':e['tiedIds']=['n13-a','n13-b']
        notes=[dict(id=e['id'],startSec=1+e['startBeat']*60/bpm,endSec=1+(e['startBeat']+e['durationBeats'])*60/bpm,midi=e['midi']) for e in events if e['kind']=='note']
        score=dict(events=events,tempoMap=[dict(beat=0,bpm=bpm)],meterMap=[dict(beat=0,numerator=4,denominator=4)])
        cases.append((f'patterns-{bpm}',score,notes,[],dict(alignmentMode='automatic')))
    # Four notes in the span of six eighths, in compound 6/8 meter.
    events=[dict(id=f'q{i}',kind='note',startBeat=i*.75,durationBeats=.75,measure=str(i//4+1),beat=1+(i%4)*1.5,midi=65+i%3,notation=dict(type='eighth',actualNotes=4,normalNotes=6)) for i in range(12)]
    score=dict(events=events,tempoMap=[dict(beat=0,bpm=120)],meterMap=[dict(beat=0,numerator=6,denominator=8)])
    notes=[dict(id=e['id'],startSec=1+e['startBeat']*.5,endSec=1+(e['startBeat']+.75)*.5,midi=e['midi']) for e in events]
    cases.append(('compound-quadruplets',score,notes,[],dict(alignmentMode='automatic')))
    for count,normal,name in [(3,2,'triplet'),(4,6,'quadruplet')]:
        duration=.5*normal/count
        events=[dict(id=f't{i}',kind='note',startBeat=i*duration,durationBeats=duration,measure='1',beat=1+i*duration*(2 if count==4 else 1),midi=60+i,notation=dict(type='eighth',actualNotes=count,normalNotes=normal)) for i in range(count)]
        score=dict(events=events,tempoMap=[dict(beat=0,bpm=120)],meterMap=[dict(beat=0,numerator=6 if count==4 else 4,denominator=8 if count==4 else 4)])
        notes=[dict(id=e['id'],startSec=1+e['startBeat']*.5,endSec=1+(e['startBeat']+duration)*.5,midi=e['midi']) for e in events]
        notes[0]['startSec']-=.05;notes[1]['startSec']+=.05
        cases.append((f'uneven-{name}',score,notes,[dict(kind='uneven_tuplet',expectedId='t0')],dict(alignmentMode='fixed',referenceOffsetSec=1)))
    beat=0;events=[]
    for i,duration in enumerate([4,2,1,.5,.25,1.5,.75,.375]):
        events.append(dict(id=f'v{i}',kind='note',startBeat=beat,durationBeats=duration,measure=str(int(beat//4)+1),beat=beat%4+1,midi=60+i%4));beat+=duration
    score=dict(events=events,tempoMap=[dict(beat=0,bpm=120)],meterMap=[dict(beat=0,numerator=4,denominator=4)])
    notes=[dict(id=e['id'],startSec=1+e['startBeat']*.5,endSec=1+(e['startBeat']+e['durationBeats'])*.5,midi=e['midi']) for e in events]
    cases.append(('whole-through-sixteenth',score,notes,[],dict(alignmentMode='fixed',referenceOffsetSec=1)))
    for kind in ['clean','early','late','incorrect_duration','missing_note','extra_note','misplaced_rest']:
        events=[dict(id=f'n{i}',kind='note',startBeat=i,durationBeats=1,measure=str(i//4+1),beat=i%4+1,midi=60+i%5) for i in range(16)]
        events[12]=dict(id='r12',kind='rest',startBeat=12,durationBeats=1,measure='4',beat=1)
        notes=[dict(id=e['id'],startSec=1+e['startBeat']*.5,endSec=1+(e['startBeat']+e['durationBeats'])*.5,midi=e['midi']) for e in events if e['kind']=='note']
        target={'early':'n2','late':'n5','incorrect_duration':'n8','missing_note':'n10','extra_note':None,'misplaced_rest':'r12'}.get(kind)
        if kind=='early': notes[2]['startSec']-=.13;notes[1]['endSec']-=.14
        if kind=='late': notes[5]['startSec']+=.14
        if kind=='incorrect_duration': notes[8]['endSec']-=.3
        if kind=='missing_note': notes=[n for n in notes if n['id']!='n10']
        if kind in ['extra_note','misplaced_rest']:notes.append(dict(id='added',startSec=7.12,endSec=7.38,midi=70));notes.sort(key=lambda n:n['startSec'])
        expected=[] if kind=='clean' else [dict(kind=kind,expectedId=target)]
        if kind in ['extra_note','misplaced_rest']: expected=[dict(kind='extra_note',expectedId=None),dict(kind='misplaced_rest',expectedId='r12')]
        score=dict(events=events,tempoMap=[dict(beat=0,bpm=120)],meterMap=[dict(beat=0,numerator=4,denominator=4)])
        cases.append((kind,score,notes,expected,dict(alignmentMode='automatic')))
    output=[]
    for name,score,notes,expected,options in cases:
        seconds=max(n['endSec'] for n in notes)+.3;y=render(notes,seconds);d=detect(y)
        sf.write(ROOT/'data'/f'control-{name}.wav',y,SR,subtype='FLOAT')
        (ROOT/'data'/f'control-{name}.score.json').write_text(json.dumps({**score,'rhythmOptions':options},indent=2)+'\n')
        row=dict(id=name,score=score,notes=d['notes'],truth=notes,expected=expected,options=options,durationSec=seconds,
                 onsets=metric([n['startSec'] for n in notes],[n['startSec'] for n in d['notes']]))
        print(name,row['onsets'],flush=True);output.append(row)
    # Continuous, genuine no-gap synthetic slur; crescendo/harmonic changes are controls.
    for name in ['slur','crescendo','harmonic-change']:
        seconds=5;t=np.arange(int(SR*seconds))/SR;f=np.full(len(t),330.)
        if name=='slur':
            f[t>=2]=370;f[t>=3]=440
        phase=2*np.pi*np.cumsum(f)/SR
        amp=np.minimum(1,t/.02)*np.minimum(1,(seconds-t)/.02)
        if name=='crescendo': amp*=.2+.8*t/seconds
        if name=='harmonic-change':y=.1*amp*(np.sin(phase)+(0.1+.7*t/seconds)*np.sin(2*phase)+.2*np.sin(3*phase))
        else:y=.1*amp*(np.sin(phase)+.5*np.sin(2*phase)+.3*np.sin(3*phase))
        d=detect(y);starts=[0,2,3] if name=='slur' else [0]
        row=dict(id=name,expectedOnsets=starts,notes=d['notes'],onsets=metric(starts,[n['startSec'] for n in d['notes']]))
        print(name,row['onsets'],flush=True);output.append(row)
    (ROOT/'data/controls.json').write_text(json.dumps(output,indent=2))
if __name__=='__main__':make()
