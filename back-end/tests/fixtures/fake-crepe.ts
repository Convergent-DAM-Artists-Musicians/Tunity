import {readFile,writeFile} from 'node:fs/promises';
const request=JSON.parse(await readFile(process.argv[process.argv.indexOf('--request')+1],'utf8'));
const mode=process.env.FAKE_CREPE_MODE;
if(mode==='wait') await new Promise(r=>setTimeout(r,10000));
if(mode==='fail') {console.error('fixture inference failure');process.exit(1);}
const frames=Array.from({length:Math.ceil(request.sampleCount/160)},(_,i)=>({timeSec:i*.01,frequencyHz:mode==='bad'?-1:440,periodicity:.99}));
await writeFile(request.outputPath,JSON.stringify({engine:'torchcrepe',model:'full',hopSec:.01,frames}));
