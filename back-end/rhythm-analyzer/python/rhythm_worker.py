"""Rhythm-specific acoustic evidence. No score quantization or pitch grading.

5 ms frames, vibrato-suppressed positive spectral flux, persistent YIN pitch
changes for soft boundaries, and relative energy gating for sounding spans.
"""
import argparse
import json
from pathlib import Path
import sys
import numpy as np
from scipy.ndimage import median_filter, maximum_filter1d, minimum_filter1d
from scipy.signal import find_peaks
import librosa

SR = 16000
HOP = 80
DT = HOP / SR


def features(y):
    spectrum = np.abs(librosa.stft(y, n_fft=1024, hop_length=HOP))
    mel = librosa.feature.melspectrogram(S=spectrum**2, sr=SR, n_fft=1024,
                                       n_mels=96, fmin=65, fmax=7600)
    log = librosa.power_to_db(mel, ref=np.max, top_db=65)
    previous = maximum_filter1d(log, size=3, axis=0)
    flux = np.zeros(log.shape[1])
    flux[2:] = np.maximum(0, log[:, 2:] - previous[:, :-2]).mean(axis=0)
    rms = librosa.feature.rms(y=y, frame_length=320, hop_length=HOP)[0]
    db = 20*np.log10(np.maximum(rms, 1e-7))
    hz = librosa.yin(y, fmin=65, fmax=1800, sr=SR, frame_length=1024, hop_length=HOP)
    midi = median_filter(librosa.hz_to_midi(hz), size=5)
    return flux, db, midi


def detect(y, debug=False):
    if not len(y) or len(y) > SR*120 or not np.isfinite(y).all():
        raise ValueError('Expected finite mono 16 kHz PCM, up to 120 seconds')
    flux, db, midi = features(y)
    gate = max(-70., float(np.percentile(db, 95))-42., min(float(np.percentile(db, 10))+12., float(np.percentile(db,95))-20.))
    voiced = median_filter((db > gate).astype(int), size=5).astype(bool)
    # Always keep sound after silence, even soft attacks with small flux.
    starts = np.flatnonzero(np.diff(voiced.astype(int), prepend=0)==1)
    ends = np.flatnonzero(np.diff(voiced.astype(int), append=0)==-1)
    candidates=[]
    for start,end in zip(starts,ends):
        if (end-start)*DT >= .06: candidates.append((int(start), 'attack', .90))
    peakscale=max(.1,float(np.percentile(flux,99)))
    peaks,_=find_peaks(flux, distance=12, prominence=peakscale*.13, height=peakscale*.16)
    for p in peaks:
        if not voiced[p]: continue
        # Reject release tails: positive flux must lead into stable audible sound.
        if p+8>=len(db) or np.median(db[p+8:min(len(db),p+18)]) < gate+6: continue
        prior=np.median(midi[max(0,p-10):max(1,p-3)])
        after=np.median(midi[p+3:min(len(midi),p+10)])
        drop=max(db[max(0,p-16):p+1])-min(db[max(0,p-10):p+1])
        if abs(after-prior) > .65 or drop>3 or flux[p]>peakscale*.45:
            # Spectral peak is delayed by the short analysis window; don't
            # backtrack all the way across a crescendo or a slurred note.
            a=max(0,p-4); b=min(len(db),p+9)
            valley=a+int(np.argmin(db[a:b]))
            # A real tongue interruption has a local energy valley with
            # recovery on both sides. Otherwise timestamp the flux peak,
            # avoiding backtracking across a slur or a flat sustain.
            recovery=min(float(np.max(db[a:valley+1])),float(np.max(db[valley:b])))-db[valley]
            onset=valley if recovery>2.5 else max(0,p-1)
            candidates.append((onset,'attack',min(.97,.55+.35*flux[p]/peakscale)))
    # A brief, deep interruption followed by recovery is rearticulation evidence
    # even at the same pitch, where spectral flux can be weak. A crescendo or
    # ordinary vibrato has no such valley. Require sound on both sides.
    valleys,_=find_peaks(-db, distance=12, prominence=5.)
    for p in valleys:
        if p<10 or p+10>=len(db): continue
        left=float(np.median(db[p-10:p-4]));right=float(np.median(db[p+4:p+10]))
        if min(left,right)-db[p]>5 and min(left,right)>gate+10:
            if not any(abs(p-a)<10 for a,_,_ in candidates): candidates.append((int(p),'attack',.78))
    # Stable pitch transition: supplementary boundary evidence, not correctness.
    changes=np.zeros(len(midi))
    for i in range(10,len(midi)-10):
        left=midi[i-10:i-3]; right=midi[i+3:i+10]
        delta=abs(np.median(left)-np.median(right))
        if voiced[i] and np.ptp(left)<.6 and np.ptp(right)<.6 and .65<delta<19:
            changes[i]=delta
    cp,_=find_peaks(changes,distance=12,prominence=.65)
    for p in cp:
        if not any(abs(p-a)<12 or (kind=='attack' and 0 < p-a < 32) for a,kind,_ in candidates): candidates.append((int(p),'pitch_transition',.72))
    # Merge independent evidence within 60ms; silence-starts are most precise.
    candidates.sort()
    merged=[]
    for c in candidates:
        if merged and (c[0]-merged[-1][0])*DT < .06:
            if c[2]>merged[-1][2]+.03: merged[-1]=c
        else: merged.append(c)
    events=[]
    for k,(a,kind,confidence) in enumerate(merged):
        next_a=merged[k+1][0] if k+1<len(merged) else len(db)-1
        end=next_a
        for i in range(a+3,next_a):
            if not voiced[i] and not voiced[min(len(voiced)-1,i+3)]:
                end=i; break
        if (end-a)*DT < .055: continue
        pm=float(np.median(midi[a+3:max(a+4,end-3)]))
        events.append(dict(startSec=round(a*DT,5),endSec=round(min(len(y)/SR,end*DT),5),
                           confidence=round(confidence,3),boundary=kind,
                           boundaryUncertaintyMs=25 if kind=='attack' else 40,
                           midi=round(pm,3),frequencyHz=float(librosa.midi_to_hz(pm)),
                           rmsDb=float(np.median(db[a:end])),offsetConfidence=.75 if end<next_a else .55))
    result=dict(engine='spectral-yin-v1',hopSec=DT,notes=events,
                silenceThresholdDb=gate, warnings=[])
    if not events: result['warnings'].append('No reliable pitched events detected.')
    if debug: result['features']=dict(flux=flux.tolist(),db=db.tolist(),midi=midi.tolist(),changes=changes.tolist())
    return result


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--request',required=True); args=parser.parse_args()
    try:
        request=json.loads(Path(args.request).read_text())
        count=request['sampleCount']
        if request['sampleRate']!=SR or type(count) is not int or not 0<count<=SR*120:
            raise ValueError('Invalid PCM dimensions')
        if Path(request['pcmPath']).stat().st_size!=4*count: raise ValueError('Invalid PCM length')
        y=np.fromfile(request['pcmPath'],dtype='<f4')
        result=detect(y)
        Path(request['outputPath']).write_text(json.dumps(result,allow_nan=False))
    except Exception as error:
        print(f'Rhythm analysis failed: {error}',file=sys.stderr); return 1
    return 0
if __name__=='__main__': sys.exit(main())
