"""Build score-alignment fixtures from visually checked source-label windows.
This is a frozen subset selection, not selected for detector correctness.
See manual-review.json for review decisions and uncertainty.
"""
import json
import soundfile as sf
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SELECTION=[('05',14,'development'),('09',22,'development'),('10',24,'test'),('15',14,'test'),('33',13,'test')]
def make():
    items=[]
    for id,count,split in SELECTION:
        score=json.loads((ROOT/'data'/f'{id}.score.json').read_text())
        truth=json.loads((ROOT/'data'/f'{id}.truth.json').read_text())[:count]
        last=next(n for n in score['events'] if n['id']==f'n{count-1}')
        score['events']=[n for n in score['events'] if n['startBeat']<last['startBeat']+last['durationBeats']-1e-7]
        end=truth[-1]['endSec']+.02
        detection=json.loads((ROOT/'data'/f'{id}.detection.json').read_text())['notes']
        detection=[n for n in detection if n['startSec']<end]
        assert [n['midi'] for n in score['events'] if n['kind']=='note']==[n['midi'] for n in truth]
        audio,sr=sf.read(ROOT/'data'/f'{id}.wav')
        sf.write(ROOT/'data'/f'{id}-verified.wav',audio[:round(end*sr)],sr,subtype='FLOAT')
        (ROOT/'data'/f'{id}-verified.score.json').write_text(json.dumps(score,indent=2)+'\n')
        items.append(dict(id=id,split=split,score=score,truth=truth,detected=detection,durationSec=end))
    (ROOT/'data/verified.json').write_text(json.dumps(items,indent=2))
if __name__=='__main__':make()
