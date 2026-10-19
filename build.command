#!/bin/sh
# Rebuilds the Fuyamo Travel pages after you edit site/js/content.js.
# Double-click this file in Finder, or run: sh build.command
cd "$(dirname "$0")" || exit 1
osascript -l JavaScript tools/build.js "$PWD"
