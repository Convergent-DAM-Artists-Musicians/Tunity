"""Machine-readable acceptance gates. Fails the process if a required gate fails."""
import hashlib,json
from pathlib import Path
from onsets import metric
ROOT=Path(__file__).resolve().parent

def read(name):return json.loads((ROOT/name).read_text())
def aggregate(rows):
    tp=sum(r['tp'] for r in rows);fp=sum(r['fp'] for r in rows);fn=sum(r['fn'] for r in rows)
    return dict(tp=tp,fp=fp,fn=fn,precision=tp/(tp+fp) if tp+fp else 1,recall=tp/(tp+fn) if tp+fn else 1,f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 1)
def errors(rows):
    kinds=sorted(set(e['kind'] for r in rows for e in r.get('expected',[])+r.get('actual',[])))
    result={}
    for kind in kinds:
        counts=[]
        for row in rows:
            expected=[e for e in row.get('expected',[]) if e['kind']==kind]
            actual=[e for e in row.get('actual',[]) if e['kind']==kind]
            # Multiset matching: duplicate findings are false positives.
            tp=0
            for e in expected:
                if e in actual:actual.remove(e);tp+=1
            counts.append(dict(tp=tp,fp=len(actual),fn=len(expected)-tp))
        result[kind]=aggregate(counts)
    return result

def main():
    onset=[]
    for c in read('clips.json'):
        ref=[n['startSec'] for n in read(c['truth'])]
        pred=[n['startSec'] for n in read(f"data/{c['id']}.detection.json")['notes']]
        onset.append(dict(id=c['id'],split=c['split'],tolerances={str(ms):metric(ref,pred,ms/1000) for ms in [25,50,100]}))
    micro={str(ms):aggregate([r['tolerances'][str(ms)] for r in onset if r['split']=='test']) for ms in [25,50,100]}
    align={}
    for engine in ['oracle','detected']:
        rows=[r for r in read('results/verified-alignment.json') if r['split']=='test' and r['engine']==engine]
        correct=sum(r['correct'] for r in rows);total=sum(r['total'] for r in rows)
        align[engine]=dict(correct=correct,total=total,accuracy=correct/total)
    controls=read('results/controls.json');real=read('results/real-controls.json')
    synthetic_errors=errors(controls);real_errors=errors(real)
    clean=[r for r in controls+real if 'expected' in r and not r['expected']]
    clean_false=sum(len(r['actual']) for r in clean)
    clean_notes=sum(r['matches'] for r in clean)
    gates={
      'heldout_onset_precision_recall_f1':all(micro['50'][m]>=.9 for m in ['precision','recall','f1']),
      'each_heldout_onset_f1':all(r['tolerances']['50']['f1']>=.85 for r in onset if r['split']=='test'),
      'oracle_alignment':align['oracle']['accuracy']>=.95,
      'detected_alignment':align['detected']['accuracy']>=.95,
      'synthetic_error_each_kind':all(r['precision']>=.9 and r['recall']>=.9 for r in synthetic_errors.values()),
      'real_edit_error_each_kind':all(r['precision']>=.9 and r['recall']>=.9 for r in real_errors.values()),
      'clean_false_findings':clean_false/max(clean_notes,1)<=.05,
      'continuous_slur_and_timbre_controls':all(r['onsets']['f1']==1 for r in controls if r['id'] in ['slur','crescendo','harmonic-change']),
    }
    files=[ROOT.parent/'python/rhythm_worker.py',*sorted((ROOT.parent/'src').glob('*.ts'))]
    output=dict(protocol='ACCEPTANCE.md',onsets=onset,heldoutMicro=micro,heldoutVerifiedAlignment=align,
      syntheticErrors=synthetic_errors,editedRealErrors=real_errors,cleanControls=dict(falseFindings=clean_false,notes=clean_notes),
      supplementaryTriplets=read('results/triplets.json'),gates=gates,passed=all(gates.values()),
      implementationSha256={str(p.relative_to(ROOT.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
    (ROOT/'results/summary.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({k:output[k] for k in ['heldoutMicro','heldoutVerifiedAlignment','cleanControls','gates','passed']},indent=2))
    if not output['passed']:raise SystemExit('Acceptance failed; see results/summary.json')
if __name__=='__main__':main()
