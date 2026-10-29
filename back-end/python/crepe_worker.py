"""Local torchcrepe worker. Receives server-owned file paths, never URLs.

Only pitch / periodicity comes from CREPE. Node measures timing and dynamics
on the original, unnormalized PCM. No automatic fallback to another detector.
"""
import argparse
import json
import math
from pathlib import Path
import sys


def validate_request(request):
    if request.get("sampleRate") != 16000:
        raise ValueError("Expected 16 kHz PCM")
    count = request.get("sampleCount")
    if type(count) is not int or not 0 < count <= 16000 * 120:
        raise ValueError("Invalid sample count")
    lo, hi = request.get("minHz"), request.get("maxHz")
    if not all(type(x) in (int, float) and math.isfinite(x) for x in (lo, hi)) or not 50 <= lo < hi <= 2006:
        raise ValueError("Invalid frequency range")
    if request.get("model") not in ("full", "tiny"):
        raise ValueError("Invalid model")
    if request.get("device") != "cpu" and not (isinstance(request.get("device"), str) and request["device"].startswith("cuda:") and request["device"][5:].isdigit()):
        raise ValueError("Invalid device")
    for key, limit in (("batchSize", 2048), ("threads", 32)):
        if type(request.get(key)) is not int or not 1 <= request[key] <= limit:
            raise ValueError(f"Invalid {key}")
    if Path(request["pcmPath"]).stat().st_size != count * 4:
        raise ValueError("PCM length does not match request")


def serialize_track(pitches, periodicities, sample_count, model):
    expected = math.ceil(sample_count / 160)
    if len(pitches) < expected or len(periodicities) < expected:
        raise ValueError("CREPE returned too few frames")
    frames = []
    for i in range(expected):
        hz, periodicity = float(pitches[i]), float(periodicities[i])
        if not math.isfinite(periodicity) or not 0 <= periodicity <= 1:
            raise ValueError("CREPE returned invalid periodicity")
        frames.append({"timeSec": i * 0.01, "frequencyHz": hz if math.isfinite(hz) else None, "periodicity": periodicity})
    return {"engine": "torchcrepe", "model": model, "hopSec": 0.01, "frames": frames}


def analyze(request):
    validate_request(request)
    # Imports are lazy so validation/protocol tests need no ML installation.
    import numpy as np
    import torch
    import torchcrepe

    torch.set_num_threads(request["threads"])
    samples = np.fromfile(request["pcmPath"], dtype="<f4")
    if not np.isfinite(samples).all():
        raise ValueError("PCM contains non-finite samples")
    audio = torch.from_numpy(samples.copy()).unsqueeze(0)
    with torch.inference_mode():
        pitch, periodicity = torchcrepe.predict(
            audio, 16000, hop_length=160,
            fmin=request["minHz"], fmax=request["maxHz"],
            model=request["model"], decoder=torchcrepe.decode.viterbi,
            return_periodicity=True, batch_size=request["batchSize"],
            device=request["device"], pad=True,
        )
    # pad=True produces centered timestamps; remove the optional final frame at EOF.
    return serialize_track(pitch[0].detach().cpu().tolist(), periodicity[0].detach().cpu().tolist(), len(samples), request["model"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    try:
        request = json.loads(Path(args.request).read_text(encoding="utf-8"))
        result = analyze(request)
        Path(request["outputPath"]).write_text(json.dumps(result, allow_nan=False, separators=(",", ":")), encoding="utf-8")
    except ImportError as error:
        print(f"Missing CREPE dependency: {error}. Install matching torch/torchaudio and python/requirements.txt in the Python environment selected by PYTHON_PATH.", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"CREPE analysis failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
