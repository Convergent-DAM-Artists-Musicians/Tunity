"""Score-free acoustic evaluation; one-to-one matching at explicit tolerances."""
import json
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.optimize import linear_sum_assignment
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'python'))
from rhythm_worker import detect

def metric(ref,pred,tolerance=.05):
    if not ref or not pred: return dict(tp=0,fp=len(pred),fn=len(ref),precision=0,recall=0,f1=0,maeMs=None)
    distance=np.abs(np.subtract.outer(ref,pred)); cost=np.where(distance<=tolerance,distance,1000.)
    ii,jj=linear_sum_assignment(cost); matched=distance[ii,jj]<=tolerance
    errors=distance[ii[matched],jj[matched]]; tp=int(sum(matched)); fp=len(pred)-tp; fn=len(ref)-tp
    return dict(tp=tp,fp=fp,fn=fn,precision=tp/len(pred),recall=tp/len(ref),f1=2*tp/(len(pred)+len(ref)),maeMs=float(np.mean(errors)*1000) if tp else None)

def run(split):
    result=[]
    for c in json.loads((ROOT/'clips.json').read_text()):
        if c['split']!=split: continue
        y,sr=sf.read(ROOT/c['audio']); d=detect(y,debug=True)
        (ROOT/'data'/f"{c['id']}.detection.json").write_text(json.dumps(d))
        truth=json.loads((ROOT/c['truth']).read_text()); ref=[n['startSec'] for n in truth]
        row=dict(id=c['id'],notes=len(ref),detected=len(d['notes']),new=metric(ref,[n['startSec'] for n in d['notes']]))
        bp=ROOT/'results'/f"{c['id']}.baseline.json"
        if bp.exists(): row['baseline']=metric(ref,[n['startSec'] for n in json.loads(bp.read_text())['notes']])
        print(row,flush=True); result.append(row)
    (ROOT/'results'/f'{split}-onsets.json').write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__': run(sys.argv[1] if len(sys.argv)>1 else 'development')
