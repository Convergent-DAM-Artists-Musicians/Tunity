import math
from pathlib import Path
import tempfile
import unittest
from crepe_worker import validate_request, serialize_track


class WorkerTests(unittest.TestCase):
    def test_centered_frames_drop_eof_and_preserve_fractional_pitch(self):
        track = serialize_track([440.5, 441, 999], [0.9, 0.8, 1], 320, "full")
        self.assertEqual(len(track["frames"]), 2)
        self.assertEqual(track["frames"][0]["frequencyHz"], 440.5)
        self.assertEqual(track["frames"][1]["timeSec"], 0.01)

    def test_nan_pitch_is_null_and_invalid_periodicity_fails(self):
        self.assertIsNone(serialize_track([math.nan], [0], 1, "tiny")["frames"][0]["frequencyHz"])
        with self.assertRaises(ValueError):
            serialize_track([440], [math.nan], 1, "full")
        with self.assertRaises(ValueError):
            serialize_track([], [], 1, "full")

    def test_request_bounds_and_pcm_size(self):
        with tempfile.TemporaryDirectory() as folder:
            pcm = Path(folder) / "audio.f32"
            pcm.write_bytes(bytes(640))
            request = dict(sampleRate=16000, sampleCount=160, minHz=65, maxHz=1800,
                           model="full", device="cpu", batchSize=256, threads=2, pcmPath=str(pcm))
            validate_request(request)
            for change in [dict(sampleRate=22050), dict(sampleCount=161), dict(minHz=20),
                           dict(maxHz=3000), dict(model="other"), dict(threads=0)]:
                with self.assertRaises(ValueError):
                    validate_request({**request, **change})


if __name__ == "__main__":
    unittest.main()
