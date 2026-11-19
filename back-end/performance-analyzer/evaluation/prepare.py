"""Supplementary expression controls made from an actual URMP trumpet sustain.
These are edited recordings, not independent human articulation performances.
Run the rhythm acquisition/preparation first. Outputs are reproducible and ignored.
"""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT.parents[1]/'rhythm-analyzer/evaluation/data'
OUT=ROOT/'data';OUT.mkdir(exist_ok=True)
truth=json.loads((SOURCE/'09.truth.json').read_text())
n=max(truth,key=lambda n:n['endSec']-n['startSec'])
x,sr=sf.read(SOURCE/'09.wav')
# Central sustain avoids transplanting a previous attack; retain actual trumpet harmonics/noise.
a=int((n['startSec']+.08)*sr);b=int((n['endSec']-.08)*sr)
tone=x[a:b]
if len(tone)<sr: raise RuntimeError('Need a sustained source longer than one second')
rows=[]
for kind in ['clean','staccato-clean','staccato-long','tenuto-short','slur-connected','slur-gap','dynamics-even','dynamics-loud','accent-present','accent-absent','crescendo-present','crescendo-absent','diminuendo-present','diminuendo-absent','pitch-drift']:
    y=np.zeros(int(4.5*sr));events=[]
    for i in range(4):
        dur=.95
        if kind=='staccato-clean':dur=.35
        if kind=='tenuto-short' and i==1:dur=.45
        if kind=='slur-connected':dur=1.0
        if kind=='slur-gap' and i==1:dur=.7
        shift=i%2*2
        # Resampling the long recorded sustain provides alternate pitches without synthesizing timbre.
        t=np.arange(round(dur*sr))*2**(shift/12)
        if kind=='pitch-drift' and i==1:
            t=np.cumsum(2**(shift/12)*2**(np.linspace(0,100,len(t))/1200))
        seg=np.interp(t,np.arange(len(tone)),tone)
        seg*=.08/np.sqrt(np.mean(seg**2))
        fade=min(round(.01*sr),len(seg)//4)
        seg[:fade]*=np.linspace(0,1,fade);seg[-fade:]*=np.linspace(1,0,fade)
        if kind=='dynamics-loud' and i==1:seg*=2.5
        if kind=='accent-present' and i==1:seg*=2
        if kind=='crescendo-present':seg*=10**((i*3)/20)
        if kind=='diminuendo-present':seg*=10**((-i*3)/20)
        start=int((.2+i)*sr);y[start:start+len(seg)]=seg
        notation={}
        if kind.startswith('staccato'):notation={'articulation':['staccato']}
        if kind=='tenuto-short':notation={'articulation':['tenuto']}
        if kind.startswith('slur'):notation={'slurToNext':i<3}
        if kind.startswith('accent') and i==1:notation={'articulation':['accent']}
        e=dict(id=f'n{i}',kind='note',startBeat=i,durationBeats=1,measure='1',beat=i+1,midi=n['midi']+shift,notation=notation)
        if kind.startswith('dynamics'):e['dynamicsDb']=0
        events.append(e)
    score=dict(events=events,tempoMap=[dict(beat=0,bpm=60)],meterMap=[dict(beat=0,numerator=4,denominator=4)],rhythmOptions=dict(alignmentMode='fixed',referenceOffsetSec=.2))
    if kind.startswith('crescendo') or kind.startswith('diminuendo'):score['hairpins']=[dict(startBeat=0,endBeat=4,kind=kind.split('-')[0])]
    expected=[]
    mapping={'staccato-long':'staccato_length','tenuto-short':'tenuto_length','slur-gap':'slur_gap','dynamics-loud':'relative_dynamics','accent-absent':'accent_contrast','crescendo-absent':'hairpin_contrast','diminuendo-absent':'hairpin_contrast','pitch-drift':'pitch_drift'}
    if kind in mapping:expected=[dict(kind=mapping[kind],expectedId=f'n{i}') for i in (range(4) if kind=='staccato-long' else [0] if 'absent' in kind and kind!='accent-absent' else [1])]
    sf.write(OUT/f'{kind}.wav',y,sr,subtype='PCM_16');(OUT/f'{kind}.score.json').write_text(json.dumps(score,indent=2))
    rows.append(dict(file=f'{kind}.wav',expected=expected,source='URMP 09, sustain '+n['id'],sourceStart=n['startSec'],sourceEnd=n['endSec']))
(OUT/'manifest.json').write_text(json.dumps(rows,indent=2))
print('Prepared',len(rows),'edited real-audio expression controls')
