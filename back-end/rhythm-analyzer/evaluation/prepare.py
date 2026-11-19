"""Create fixed <=60s clips and preserve independent score and performed annotations."""
from pathlib import Path
import json
import librosa
import soundfile as sf
import numpy as np
import mido
from acquire import ROOT, FOLDERS

def prepare():
    manifest=[]
    for folder,split in FOLDERS:
        if split == 'supplementary': continue
        base=ROOT/'data'/folder
        truth=np.loadtxt(next(base.glob('Notes_1_*.txt')))
        # End between whole notes; retain lead-in and all rests in the excerpt.
        full_truth=truth.copy()
        truth=truth[truth[:,0]+truth[:,2] < 59]
        end=min(truth[-1,0]+truth[-1,2]+.25, full_truth[len(truth),0]-.02) if len(truth)<len(full_truth) else truth[-1,0]+truth[-1,2]+.25
        y,sr=sf.read(next(base.glob('AuSep_1_*.wav')))
        y=librosa.resample(y[:int(end*sr)],orig_sr=sr,target_sr=16000)
        name=folder[:2]; dest=ROOT/'data'/f'{name}.wav'; sf.write(dest,y,16000,subtype='FLOAT')
        # MIDI score, not quantized audio labels: first pitched instrument track.
        midi=mido.MidiFile(next(base.glob('*.mid')))
        tracks=[]; tempo=500000; meter=[4,4]
        for track in midi.tracks:
            t=0; active={}; notes=[]
            for msg in track:
                t+=msg.time
                if msg.type=='set_tempo': tempo=msg.tempo
                if msg.type=='time_signature': meter=[msg.numerator,msg.denominator]
                if msg.type=='note_on' and msg.velocity:
                    active[msg.note]=t
                elif msg.type in ('note_off','note_on') and msg.note in active:
                    start=active.pop(msg.note)/midi.ticks_per_beat
                    notes.append(dict(midi=msg.note,startBeat=start,durationBeats=t/midi.ticks_per_beat-start))
            if notes: tracks.append(sorted(notes,key=lambda n:n['startBeat']))
        notes=tracks[0][:len(truth)]
        # URMP MIDI uses playback gates (e.g. .949 for a written quarter).
        # Recover the standard notated durations, not audio-derived values.
        values=np.array([.125,1/6,.25,1/3,.375,.5,2/3,.75,1,1.5,2,3,4,6,8])
        for i,n in enumerate(notes):
            dur=n['durationBeats']; nearest=float(values[np.argmin(abs(values-dur))])
            if abs(nearest-dur)<max(.025,dur*.08): n['durationBeats']=nearest
            if i+1<len(notes): n['durationBeats']=min(n['durationBeats'],notes[i+1]['startBeat']-n['startBeat'])

        # URMP score/annotation order verification is independent of the detector.
        annotation_midi=np.rint(librosa.hz_to_midi(truth[:,1])).astype(int)
        print(name,split,'notes',len(truth),'score',len(notes),'pitch sequence mismatches',sum(n['midi'] != p for n,p in zip(notes,annotation_midi)), 'tempo',60e6/tempo,'meter',meter,flush=True)
        events=[]; previous=0
        for i,n in enumerate(notes):
            b=n['startBeat']; dur=n['durationBeats']; bar=meter[0]*4/meter[1]
            if b>previous+1e-5: events.append(dict(id=f'r{i}',kind='rest',startBeat=previous,durationBeats=b-previous,measure=str(int(previous//bar)+1),beat=1+(previous%bar)*meter[1]/4))
            events.append(dict(id=f'n{i}',kind='note',**n,measure=str(int(b//bar)+1),beat=1+(b%bar)*meter[1]/4))
            previous=b+dur
        ref=dict(events=events,tempoMap=[dict(beat=0,bpm=60e6/tempo)],meterMap=[dict(beat=0,numerator=meter[0],denominator=meter[1])])
        (ROOT/'data'/f'{name}.score.json').write_text(json.dumps(ref,indent=2))
        ann=[dict(id=f'n{i}',startSec=float(a),endSec=float(a+d),midi=int(p)) for i,((a,_,d),p) in enumerate(zip(truth,annotation_midi))]
        (ROOT/'data'/f'{name}.truth.json').write_text(json.dumps(ann,indent=2))
        manifest.append(dict(id=name,split=split,audio=f'data/{name}.wav',score=f'data/{name}.score.json',truth=f'data/{name}.truth.json',endSec=end,source=folder))
    (ROOT/'clips.json').write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__': prepare()
