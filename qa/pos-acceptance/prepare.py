import subprocess,tarfile,io,pathlib,shutil,json,hashlib
root=pathlib.Path('context');root.mkdir()
for label,sha in [('integration','ec830441bd56f8929e5629da8eead4029457930e'),('rollback','99448d0b2e3d2cf15df7d8249b52c5403341b020')]:
 repo=pathlib.Path(label);assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==sha
 target=root/label;target.mkdir();manifest={};omitted=[]
 archive=tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git','archive',sha],cwd=repo)))
 for item in archive:
  if not item.isfile():continue
  if any(part.startswith('.env') or part.startswith('.secret') for part in pathlib.PurePosixPath(item.name).parts) or item.name.startswith(('.github/','docs/','tests/')) or '.test.' in item.name or (item.name.startswith('functions/fixtures/') and item.name!='functions/fixtures/productionWeeklyMenu.json'):
   omitted.append(item.name);continue
  data=archive.extractfile(item).read();dest=target/item.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);manifest[item.name]=hashlib.sha256(data).hexdigest()
 (root/(label+'-manifest.json')).write_text(json.dumps({'sha':sha,'files':manifest,'omitted':omitted},sort_keys=True))
shutil.copytree('harness/qa/pos-acceptance',root/'harness')
shutil.copy('harness/qa/pos-acceptance/Dockerfile',root/'Dockerfile')
