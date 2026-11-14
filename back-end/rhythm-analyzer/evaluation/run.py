"""Run from any directory with the evaluation Python environment and Node 24+."""
import argparse,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--acquire',action='store_true',help='Download/check pinned URMP files')
p.add_argument('--baseline',action='store_true',help='Re-run original CREPE pipeline; requires original Python dependencies')
a=p.parse_args()
env={**os.environ,'PYTHON_PATH':sys.executable}
def run(*args):
    print('Running',*args,flush=True)
    subprocess.run(args,cwd=ROOT.parent,env=env,check=True)
def py(script,*args):run(sys.executable,str(ROOT/script),*args)
def node(script,*args):run(os.environ.get('TUNITY_NODE_PATH','node'),str(ROOT/script),*args)
(ROOT/'results').mkdir(exist_ok=True);(ROOT/'data').mkdir(exist_ok=True)
if a.acquire:py('acquire.py')
py('prepare.py')
if a.baseline:node('baseline.ts')
for split in ['development','test']:
    py('onsets.py',split)
    node('alignment.ts',split)
py('make_verified.py');node('verified.ts')
py('controlled.py');node('controls.ts')
py('real_edits.py');node('controls.ts','real-controls')
py('triplets.py');node('triplets.ts')
py('report.py')
