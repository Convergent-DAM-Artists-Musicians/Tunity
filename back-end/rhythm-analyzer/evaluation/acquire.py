"""Download only isolated trumpet takes and references; never mixes/videos.
URMP primary source: https://labsites.rochester.edu/air/projects/URMP.html
Mirror pinned to a revision. Audio stays in ignored data/, not redistributed.
"""
from pathlib import Path
from urllib.request import urlretrieve
import hashlib
import json

ROOT = Path(__file__).resolve().parent
REVISION = '58177a0'  # immutable mirror revision
FOLDERS = [('05_Entertainer_tpt_tpt', 'development'), ('09_Jesus_tpt_vn', 'development'),
           ('10_March_tpt_sax', 'test'), ('15_Surprise_tpt_tpt_tbn', 'test'),
           ('33_Elise_tpt_tpt_hn_tbn', 'test'), ('42_Arioso_tpt_tpt_hn_tbn_tba', 'supplementary')]

def main():
    manifest = []
    previous = {e['path']: e['sha256'] for e in json.loads((ROOT/'acquisition.json').read_text())} if (ROOT/'acquisition.json').exists() else {}
    for folder, split in FOLDERS:
        piece = '_'.join(folder.split('_')[:2])
        names = [f'AuSep_1_tpt_{piece}.wav', f'Notes_1_tpt_{piece}.txt',
                 f'Sco_{folder}.mid', f'Sco_{folder}.pdf']
        for name in names:
            path = ROOT / 'data' / folder / name
            path.parent.mkdir(parents=True, exist_ok=True)
            url = f'https://huggingface.co/datasets/Eredis02/URMP/resolve/{REVISION}/{folder}/{name}'
            if not path.exists():
                print('Downloading', name, flush=True)
                tmp = path.with_suffix(path.suffix + '.download')
                urlretrieve(url, tmp)
                tmp.replace(path)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if str(path.relative_to(ROOT)) in previous and previous[str(path.relative_to(ROOT))] != digest:
                raise RuntimeError(f"Checksum mismatch: {path}; restore the pinned source before evaluating")
            manifest.append(dict(path=str(path.relative_to(ROOT)), url=url, split=split,
                                 sha256=digest))
    (ROOT / 'acquisition.json').write_text(json.dumps(manifest, indent=2)+'\n')

if __name__ == '__main__':
    main()
