#!/bin/sh
# Fuyamo Travel: copies the latest published site (the "live" branch on GitHub) into public_html.
# Lives in the hosting home folder (/home/fuyamamk) and runs every 5 minutes from a cron job in cPanel.
# What it did is written to ~/fuyamo-deploy.log.
REPO=https://github.com/Fuyamo/Fuyamo-Travel-website.git
SRC=$HOME/fuyamo-live
WEB=$HOME/public_html
LOG=$HOME/fuyamo-deploy.log
if [ ! -d "$SRC/.git" ]; then
  git clone -q --depth 1 --branch live "$REPO" "$SRC" >>"$LOG" 2>&1 || exit 1
  cd "$SRC" || exit 1
else
  cd "$SRC" || exit 1
  git fetch -q --depth 1 origin live >>"$LOG" 2>&1 || exit 1
  [ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ] && exit 0
  git reset -q --hard FETCH_HEAD
fi
# Files removed from the site are removed here too; hosting files that aren't part of the site are left alone.
rsync -a --delete --exclude=.git --exclude=.well-known --exclude=cgi-bin --exclude=.user.ini --exclude=php.ini --exclude=error_log ./ "$WEB/" >>"$LOG" 2>&1 \
  && echo "$(date '+%Y-%m-%d %H:%M') published: $(git log -1 --format=%s)" >>"$LOG"
