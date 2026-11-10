#!/bin/sh
# Screenshot the harness with headless Chrome into docs/shots/. Serve the repo first:
#   /usr/bin/python3 -m http.server 8794 --bind 127.0.0.1 --directory .
# Needs network for React (esm.sh). The pane is 1200 x 800 beside a 220 px stand-in sidebar.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$(cd "$(dirname "$0")/.." && pwd)/docs/shots"
mkdir -p "$OUT"
BASE="http://127.0.0.1:${PORT:-8794}/harness/"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="${3:-1420,800}" --virtual-time-budget=12000 --screenshot="$OUT/$1.png" "$BASE?$2" 2>/dev/null; echo "$OUT/$1.png"; }
if [ "$1" = card ]; then "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,600 --virtual-time-budget=4000 --screenshot="$OUT/../catalog/card.png" "${BASE}card.html" 2>/dev/null; echo "$OUT/../catalog/card.png"; exit; fi
if [ -n "$1" ]; then shot "$1" "$2" "$3"; exit; fi
shot room-invite-light "state=invite"
shot room-invite-dark "state=invite&theme=dark"
shot quick-light "state=quick"
shot quick-dark "state=quick&theme=dark"
shot quick2-light-orange "state=quick2&accent=orange"
shot pass-light "state=pass"
shot pass-dark-green "state=pass&theme=dark&accent=green"
shot pass-light-red "state=pass&accent=red"
shot note-read-light "state=note"
shot note-walk-dark "state=notewalk&theme=dark"
shot changes-light "state=changes"
shot apply-dark "state=apply&theme=dark"
shot openings-light "state=openings"
shot openings-dark "state=openings&theme=dark"
shot working-light "state=working"
shot nomodel-dark "state=nomodel&theme=dark"
shot cutoff-light "state=cutoff"
shot off-light "state=off"
shot ask-light "state=ask"
shot words-light "state=words"
shot cuts-light "state=cuts"
shot wording-light "state=wording"
shot wording2-dark "state=wording2&theme=dark"
shot phrase-light-orange "state=phrase&accent=orange"
shot cuts2-dark "state=cuts2&theme=dark"
shot words2-dark "state=words2&theme=dark"
shot words2-light-red "state=words2&accent=red"
shot words-off-light "state=wordsoff"
shot ask-empty-dark "state=askempty&theme=dark"
shot menu-light "state=menu"
shot finish-dark "state=finish&theme=dark"
shot finish-word-light "state=finishword"
shot history-light "state=history"
shot about-light "state=about"
shot plain-light "state=quick&scene=plain"
shot shape-light "state=quick&shape=1"
shot marsh-light "state=quick&scene=marsh"
shot room-sheet-light "state=room&scene=marsh"
shot large-high-dark "state=pass&look=1&theme=dark"
shot shape-dark-red "state=pass&shape=1&theme=dark&accent=red"
shot narrow-light "state=quick&width=800" 800,800
shot narrow-dark "state=words&width=800&theme=dark" 800,800
shot medium-light "state=pass&width=1000" 1000,800
shot narrow-pass-dark-red "state=pass&width=800&theme=dark&accent=red" 800,800
shot wide-light "state=pass" 1920,1080
# every method has its own surface (0.2.0)
shot flip-light "state=flip"
shot flip-dark "state=flip&theme=dark"
shot promise-light "state=promise"
shot promise-dark "state=promise&theme=dark"
shot draft-light "state=draft"
shot draft-dark "state=draft&theme=dark"
shot voice-light "state=voice"
shot voice-dark "state=voice&theme=dark"
shot panel-light "state=panel"
shot panel-dark "state=panel&theme=dark"
shot panelwalk-light "state=panelwalk"
shot panelwalk-dark "state=panelwalk&theme=dark"
shot debate-light "state=debate"
shot debate-dark "state=debate&theme=dark"
shot debate3-light "state=debate3"
shot debate3-dark "state=debate3&theme=dark"
shot debating-light "state=debating"
shot debating-dark "state=debating&theme=dark"
shot lessons-light "state=lessons"
shot lessons-dark "state=lessons&theme=dark"
shot guidance-light "state=guidance"
shot guidance-dark "state=guidance&theme=dark"
shot choose-light "state=choose"
shot choose-dark "state=choose&theme=dark"
shot across-light "state=across"
shot across-dark "state=across&theme=dark"
shot library-light "state=library"
shot library-dark "state=library&theme=dark"
shot figures-light "state=figures"
shot figures-dark "state=figures&theme=dark"
shot yourguidance-light "state=yourguidance"
shot yourguidance-dark "state=yourguidance&theme=dark"
shot home-light "state=home"
shot home-dark "state=home&theme=dark"
shot homedone-light "state=homedone"
shot homedone-dark "state=homedone&theme=dark"
shot about-dark "state=about&theme=dark"
shot panel-narrow-dark "state=panel&width=800&theme=dark" 800,800
shot flip-narrow-light "state=flip&width=800" 800,800
# the note walk on a piece several screens tall, the Ask line for a novelist (persona fixes, Nov 8)
shot walk-long-light "state=longwalk&step=2" 1420,900
shot walk-long-dark "state=longwalk&step=3&theme=dark" 1420,900
shot rewalk-light "state=rewalk" 1420,900
shot rewalk-dark "state=rewalk&theme=dark" 1420,900
shot quick-long-light "state=longquick" 1420,900
shot quick-long-dark "state=longquick&theme=dark" 1420,900
shot fixmyself-light "state=fixmyself&step=2" 1420,900
shot walk-long-narrow-light "state=longwalk&step=1&width=800" 800,800
shot walk-long-narrow-dark "state=longwalk&step=1&width=800&theme=dark" 800,800
shot ask-fiction-light "state=askfiction" 1420,900
shot ask-fiction-dark "state=askfiction&theme=dark" 1420,900
shot library-fiction-dark "state=libfiction&theme=dark" 1420,900
shot history-dark "state=history&theme=dark" 1420,900
