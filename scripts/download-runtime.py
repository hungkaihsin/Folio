"""Download official Electron archives in verified HTTP ranges; validate using npm's checksums."""
import concurrent.futures, subprocess, os, math, pathlib, hashlib, json, urllib.request
base=pathlib.Path(__file__).resolve().parent.parent
checks=json.loads((base/'node_modules/electron/checksums.json').read_text())
files=['electron-v45.0.0-darwin-arm64.zip','electron-v45.0.0-win32-x64.zip']
def download(name):
    url='https://github.com/electron/electron/releases/download/v45.0.0/'+name
    req=urllib.request.Request(url,method='HEAD')
    with urllib.request.urlopen(req,timeout=30) as response:
        total=int(response.headers['Content-Length']);resolved=response.geturl()
    folder=base/'work'/name.replace('.zip','-chunks');folder.mkdir(exist_ok=True)
    chunk=512*1024;count=math.ceil(total/chunk)
    def get(i):
        start=i*chunk;end=min(total-1,start+chunk-1);target=folder/str(i)
        if target.exists() and target.stat().st_size==end-start+1:return
        subprocess.run(['curl','-L','--fail','--silent','--show-error','--retry','2','--connect-timeout','15','--max-time','120','--range',f'{start}-{end}',resolved+f'&folio_part={i}','-o',str(target)],check=True)
        if target.stat().st_size!=end-start+1:raise ValueError('Range length mismatch: '+str(i))
    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:
        for i,_ in enumerate(pool.map(get,range(count))):
            if i%32==31:print(name, str(i+1)+'/'+str(count),flush=True)
    target=base/'work'/name
    with target.open('wb') as out:
        for i in range(count):out.write((folder/str(i)).read_bytes())
    actual=hashlib.sha256(target.read_bytes()).hexdigest()
    if actual!=checks[name]:raise ValueError('SHA-256 mismatch')
    print(name, 'SHA-256 verified',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(download,files))
