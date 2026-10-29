import { analyzeClip } from './analyzer.ts';
import { examplePerformance, reference } from './fixtures.ts';

console.log(JSON.stringify(await analyzeClip(examplePerformance(), reference), null, 2));
