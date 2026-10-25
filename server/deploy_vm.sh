#!/usr/bin/env bash
set -Eeuo pipefail
repo=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
cd "$repo"
if [[ -n "$(git status --porcelain)" ]]; then echo 'STOP: source checkout has local changes.' >&2; exit 1; fi
commit=$(git rev-parse HEAD)
base="$HOME/.local/share/duolibee-chat/releases"
mkdir -p "$base"
stage=$(mktemp -d "$base/${commit:0:12}.XXXXXXXX")
git archive "$commit" server data | tar -x -C "$stage"
python3 -m venv "$stage/venv"
"$stage/venv/bin/python" -m pip install -r "$stage/server/requirements.txt"
for test in "$HOME"/duolibee-chat/test_*.py; do
  [[ -f "$test" ]] || continue
  cp "$test" "$stage/server/test_vm_$(basename "$test")"
done
(cd "$stage/server" && "$stage/venv/bin/python" -m unittest discover -s . -p 'test_*.py' -v)
"$stage/venv/bin/python" - "$stage" <<'PY'
import json,sys,tempfile
from pathlib import Path
root=Path(sys.argv[1]);sys.path.insert(0,str(root/'server'))
from chat_app import build_catalog,create_app
lessons=json.loads((root/'data/lessons.json').read_text());manifest=json.loads((root/'data/chat-missions.json').read_text())
assert len(build_catalog(lessons,manifest))==100
with tempfile.TemporaryDirectory() as tmp:
    c=create_app(Path(tmp),token='test',public_origin='https://bthompson91.github.io',google_client_id='test',identity_verifier=lambda raw:{'sub':'release-test'},catalog_loader=lambda:(lessons,manifest)).test_client()
    assert c.get('/health',headers={'Origin':'https://bthompson91.github.io','Authorization':'Bearer test'}).get_json()['enabledMissions']==100
PY
"$stage/venv/bin/python" -m pip freeze > "$stage/installed-requirements.txt"
printf '%s\n' "$commit" > "$stage/COMMIT"
unit=/etc/systemd/system/duolibee-chat.service.d/zzzz-git.conf
sudo mkdir -p "$(dirname "$unit")"
had_override=0
if sudo test -f "$unit"; then sudo cp "$unit" "$stage/previous-unit.conf"; had_override=1; fi
cat > "$stage/service.conf" <<EOF
[Service]
WorkingDirectory=$stage/server
ExecStart=
ExecStart=$stage/venv/bin/gunicorn --bind 127.0.0.1:15002 --workers 1 --threads 1 --timeout 120 --graceful-timeout 120 --error-logfile - "chat_app:create_app()"
EOF
activated=0
rollback() {
  status=$?
  trap - ERR
  if [[ "$activated" == 1 ]]; then
    if [[ "$had_override" == 1 ]]; then sudo cp "$stage/previous-unit.conf" "$unit"; else sudo rm -f "$unit"; fi
    sudo systemctl daemon-reload
    sudo systemctl restart duolibee-chat || true
    echo 'Activation failed; previous service configuration restored. Existing database and backups were not replaced.' >&2
  fi
  exit "$status"
}
trap rollback ERR
state="$HOME/.local/state/duolibee-chat"
mkdir -p "$state"
chmod 700 "$state"
"$stage/venv/bin/python" - "$state" "$stage" <<'PY'
import json,sqlite3,sys,time
from pathlib import Path
state,root=map(Path,sys.argv[1:]);db=state/'chat.sqlite3'
if db.exists():
    recovery=state/('pre-git-deploy-'+str(time.time_ns())+'.sqlite3')
    with sqlite3.connect(db) as src,sqlite3.connect(recovery) as dst:src.backup(dst)
    recovery.chmod(0o600)
catalog={'lessons':json.loads((root/'data/lessons.json').read_text()),'manifest':json.loads((root/'data/chat-missions.json').read_text())}
p=state/'catalog-display-v2.tmp';p.write_text(json.dumps(catalog));p.chmod(0o600);p.replace(state/'catalog-display-v2.json')
PY
activated=1
sudo install -m 644 "$stage/service.conf" "$unit"
sudo systemctl daemon-reload
sudo systemctl restart duolibee-chat
sleep 3
sudo systemctl is-active --quiet duolibee-chat
headers=$(mktemp)
status=$(curl --max-time 20 -sS -D "$headers" -o /dev/null -w '%{http_code}' -X OPTIONS 'https://158-179-30-201.sslip.io/duolibee/chat/sessions' -H 'Origin: https://bthompson91.github.io' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type')
[[ "$status" == 204 ]]
grep -qi '^access-control-allow-origin: https://bthompson91.github.io' "$headers"
rm -f "$headers"
printf '%s\n' "$commit" > "$state/installed-commit"
activated=0
trap - ERR
printf 'Installed backend v0.26.0, commit %s. Tests and browser preflight passed. Verify Google sign-in and a real assessment in the website.\n' "$commit"
