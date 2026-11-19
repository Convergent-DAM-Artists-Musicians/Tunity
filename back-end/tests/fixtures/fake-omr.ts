import {copyFile} from 'node:fs/promises';
import {join} from 'node:path';
if(process.argv.includes('--wait'))await new Promise(r=>setTimeout(r,10000));
if(process.argv.includes('--fail'))process.exit(1);
if(!process.argv.includes('--empty'))await copyFile(new URL('../../fixtures/scale.musicxml',import.meta.url),join(process.argv[process.argv.indexOf('-output')+1],'score.musicxml'));
