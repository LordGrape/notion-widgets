import fs from 'node:fs';
function read(path){return fs.readFileSync(path,'utf8')}
function write(path,value){fs.writeFileSync(path,value)}
function replaceOnce(path,oldStr,newStr,label){const src=read(path),count=src.split(oldStr).length-1;if(count!==1)throw new Error(`${label}: expected one match, found ${count}`);write(path,src.replace(oldStr,newStr))}

if(!read('worker/src/auth.ts').includes('isPublicWidgetAsset')){
  replaceOnce(
    'worker/src/auth.ts',
    '  const requiresWidgetKey = pathname ? !PUBLIC_STUDYENGINE_ROUTES.has(pathname) : true;',
    '  const isPublicWidgetAsset = pathname ? pathname.startsWith("/widgets/") : false;\n  const requiresWidgetKey = pathname ? !PUBLIC_STUDYENGINE_ROUTES.has(pathname) && !isPublicWidgetAsset : true;',
    'public widget auth exception'
  );
}

if(!read('worker/src/index.ts').includes('handleWidgetAsset')){
  replaceOnce(
    'worker/src/index.ts',
    'import { handleVisual } from "./routes/visual";',
    'import { handleVisual } from "./routes/visual";\nimport { handleWidgetAsset } from "./routes/widgets";',
    'widget route import'
  );
  replaceOnce(
    'worker/src/index.ts',
    '      if (route === "state" && key) {\n        return withCorsHeaders(await handleState(request, env, key));\n      }',
    '      if (route === "widgets") {\n        if (request.method !== "GET") return methodNotAllowed();\n        return withCorsHeaders(await handleWidgetAsset(request));\n      }\n\n      if (route === "state" && key) {\n        return withCorsHeaders(await handleState(request, env, key));\n      }',
    'widget proxy route'
  );
}

console.log('Stable widget proxy applied.');
