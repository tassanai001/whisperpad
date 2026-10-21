#!/bin/bash
# Dictation Pad launcher v3 — กดกี่ครั้งก็ได้หน้าต่างเดียว
# 1) ถาม server ให้ focus หน้าต่าง pad ที่เปิดอยู่ (server มีสิทธิ์ System Events อยู่แล้ว)
# 2) ถ้าไม่มีเลย ค่อยเปิด app-window ใหม่
URL_KEY="localhost:8917/dictation-pad"
STATE=$(curl -s -m 3 "http://127.0.0.1:8917/focus" 2>/dev/null | grep -o '"focused"')

if [ -z "$STATE" ]; then
  exec open -na "Google Chrome" --args --window-size=440,150 --app="http://$URL_KEY.html"
fi
