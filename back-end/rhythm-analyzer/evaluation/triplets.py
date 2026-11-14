"""Additional unedited real trumpet triplets, acquired after detector freeze.
URMP 42, measures 39-40, first trumpet: two sextuplet groups followed by an eighth-note triplet, plus preceding eighth.
Source timings 124.957..129.097, not resynthesized or time-stretched.
"""
import json,sys
from pathlib import Path
import numpy as np, librosa, soundfile as sf
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'python'))
from rhythm_worker import detect
from onsets import metric

def run():
    folder=ROOT/'data/42_Arioso_tpt_tpt_hn_tbn_tba'
    ann=np.loadtxt(folder/'Notes_1_tpt_42_Arioso.txt')[156:172]
    start=124.91;end=129.12
    y,sr=sf.read(folder/'AuSep_1_tpt_42_Arioso.wav')
    y=librosa.resample(y[int(start*sr):int(end*sr)],orig_sr=sr,target_sr=16000)
    sf.write(ROOT/'data/42-triplets.wav',y,16000,subtype='FLOAT')
    truth=[dict(id=f'n{i}',startSec=float(a-start),endSec=float(a+d-start),midi=int(round(librosa.hz_to_midi(hz)))) for i,(a,hz,d) in enumerate(ann)]
    score=dict(events=[dict(id=n['id'],kind='note',midi=n['midi'],startBeat=0 if i==0 else .5+(i-1)/3,durationBeats=.5 if i==0 else 1/3,measure='38' if i==0 else str(39+(i-1)//12),beat=4.5 if i==0 else 1+((i-1)/3)%4,notation=dict(type='eighth',actualNotes=1 if i==0 else 6 if i<=12 else 3,normalNotes=1 if i==0 else 4 if i<=12 else 2)) for i,n in enumerate(truth)],tempoMap=[dict(beat=0,bpm=80)],meterMap=[dict(beat=0,numerator=4,denominator=4)])
    d=detect(y,debug=True)
    (ROOT/'data/42-triplets.truth.json').write_text(json.dumps(truth,indent=2))
    (ROOT/'data/42-triplets.score.json').write_text(json.dumps(score,indent=2))
    (ROOT/'data/42-triplets.detection.json').write_text(json.dumps(d))
    result=dict(id='42-triplets',sourceStartSec=start,durationSec=end-start,notes=len(truth),onsets=metric([n['startSec'] for n in truth],[n['startSec'] for n in d['notes']]))
    (ROOT/'results/triplets.json').write_text(json.dumps(result,indent=2));print(result)
if __name__=='__main__':run()
