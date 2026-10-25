#!/bin/sh
# Deploys a commit of main on this server. GitHub Actions calls it over SSH
# after CI has passed, passing the commit sha as the SSH "command":
#
#   ssh deploy-host <40-character sha>
#
# The key CI uses is restricted in authorized_keys to run only this script
# (see docs/deploy.md), so the sha arrives in SSH_ORIGINAL_COMMAND. For a manual
# deploy run it yourself:  SSH_ORIGINAL_COMMAND=<sha> sh infra/prod/deploy.sh
#
# Everything is inside main() and the script ends with `exit`: the git step
# below can replace this very file, and sh reads a script as it runs, so the
# whole body has to be parsed before anything changes.
set -eu

BRANCH=${DEPLOY_BRANCH:-main}
ENV_FILE=${ENV_FILE:-.env.production}
# Only for testing against a local certificate authority, e.g. DEPLOY_CURL_OPTS=-k
DEPLOY_CURL_OPTS=${DEPLOY_CURL_OPTS:-}

main() {
  sha=${SSH_ORIGINAL_COMMAND:-}
  case $sha in
    *[!0-9a-f]* | '') fail "expected a commit sha, got '$sha'" ;;
  esac
  [ ${#sha} -eq 40 ] || fail "expected a 40-character commit sha, got '$sha'"

  cd "$(dirname "$0")/../.."
  compose="docker compose --env-file $ENV_FILE -f infra/docker-compose.prod.yml"

  say "Fetching $BRANCH"
  git fetch --quiet origin "$BRANCH"
  # Only commits that are on the branch may be deployed, whatever was asked for.
  git merge-base --is-ancestor "$sha" "origin/$BRANCH" ||
    fail "$sha is not on $BRANCH"
  git merge --ff-only --quiet "$sha"
  say "Deploying $(git log -1 --format='%h %s')"

  $compose build
  # Migrations run before the new API starts, so it never sees the old schema.
  $compose up -d --wait db
  $compose run --rm migrate
  $compose up -d

  domain=$(sed -n 's/^DOMAIN=//p' "$ENV_FILE")
  say "Waiting for https://$domain/api/health"
  for _ in $(seq 1 30); do
    if curl -fsS $DEPLOY_CURL_OPTS "https://$domain/api/health" | grep -q '"status":"ok"'; then
      docker image prune -f >/dev/null
      say "Deployed $sha"
      return 0
    fi
    sleep 3
  done

  $compose logs --tail 40 api || true
  fail "the API did not become healthy within 90 seconds"
}

say() { echo "==> $*"; }
fail() {
  echo "deploy: $*" >&2
  exit 1
}

main
exit
