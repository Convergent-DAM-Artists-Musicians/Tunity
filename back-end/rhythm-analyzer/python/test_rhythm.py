import unittest
import numpy as np
from rhythm_worker import detect

class RhythmAudioTests(unittest.TestCase):
    def test_silence_and_nonfinite(self):
        self.assertEqual(detect(np.zeros(16000))['notes'], [])
        with self.assertRaises(ValueError): detect(np.array([float('nan')]))
        with self.assertRaises(ValueError): detect(np.zeros(0))

    def test_smooth_loudness_and_harmonic_changes_are_not_attacks(self):
        sr=16000;t=np.arange(sr*3)/sr
        phase=2*np.pi*330*t
        y=.1*(.2+.8*t/3)*(np.sin(phase)+(.1+.5*t/3)*np.sin(2*phase))
        notes=detect(y)['notes']
        self.assertEqual(len(notes),1)

    def test_slur_has_boundaries_without_amplitude_gaps(self):
        sr=16000;t=np.arange(sr*4)/sr;f=np.where(t<1.5,330,np.where(t<2.5,370,440))
        phase=2*np.pi*np.cumsum(f)/sr
        y=.1*(np.sin(phase)+.5*np.sin(2*phase)+.3*np.sin(3*phase))
        times=[n['startSec'] for n in detect(y)['notes']]
        self.assertEqual(len(times),3)
        for expected,actual in zip([0,1.5,2.5],times):self.assertLess(abs(expected-actual),.05)

if __name__=='__main__':unittest.main()
