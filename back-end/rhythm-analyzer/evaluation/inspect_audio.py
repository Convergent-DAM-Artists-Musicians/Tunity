"""Independent annotation review sheets: waveform/spectrogram and source labels.
No predicted boundaries are shown; run before checking algorithm errors.
"""
import json
from pathlib import Path
import numpy as np
import soundfile as sf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parent

def plot(id,start,end):
    y,sr=sf.read(ROOT/'data'/f'{id}.wav'); truth=json.loads((ROOT/'data'/f'{id}.truth.json').read_text())
    fig,axs=plt.subplots(2,1,figsize=(16,5),sharex=True,layout='constrained')
    a,b=int(start*sr),min(len(y),int(end*sr)); t=np.arange(a,b)/sr
    axs[0].plot(t,y[a:b],lw=.3); axs[1].specgram(y[a:b],Fs=sr,NFFT=512,noverlap=448,xextent=(start,b/sr),cmap='magma',vmin=-100,vmax=-35)
    axs[1].set_ylim(0,3000)
    for i,n in enumerate(truth):
        if start<=n['startSec']<=end:
            for ax in axs: ax.axvline(n['startSec'],color='cyan',lw=.7)
            axs[0].text(n['startSec'],axs[0].get_ylim()[1]*.75,f"{i}\n{n['startSec']:.3f}",fontsize=8)
    axs[1].set_xlabel('Seconds');axs[0].set_title(f'URMP {id}: waveform / spectrum; cyan = supplied annotation, no detector output')
    fig.savefig(ROOT/'data'/f'{id}-review-{start:g}.png',dpi=130);plt.close(fig)
if __name__=='__main__':
    for id,start,end in [('05',2,8),('05',20,23),('09',5,12),('09',12,18),('09',18,20),('09',20,27),('10',0,10),('15',0,10),('33',0,10),('09',26,33),('09',38,41)]: plot(id,start,end)
