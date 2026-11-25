import os from 'node:os';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('benchmark-results',{recursive:true});
const m={node:process.version,v8:process.versions.v8,platform:process.platform,arch:process.arch,cpu:os.cpus().map(x=>({model:x.model,speed:x.speed})),memory:os.totalmem(),release:os.release(),runner:process.env.RUNNER_NAME,sha:process.env.GITHUB_SHA};
writeFileSync('benchmark-results/machine.json',JSON.stringify(m,null,2));console.log(JSON.stringify(m));
