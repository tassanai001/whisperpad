#!/bin/bash
# Dictation Pad launcher v4 — pad อยู่ใน Chrome instance ของตัวเอง แยกจาก Chrome หลักของผู้ใช้
# v3 พังตรงไหน: `open -na "Google Chrome"` ไม่มี --user-data-dir → instance นั้นคือ Chrome หลักของผู้ใช้
#   → cold start เจอหน้าต่าง "Who's using Chrome?" (profile picker) ทับ pad · และ kill ไม่ได้เพราะพับกับ Chrome หลัก
# v4: กด hotkey ทุกครั้ง = ปิด pad เก่า (kill เฉพาะ process ที่ใช้ --user-data-dir ของ pad) → เปิดใหม่สด ๆ บน Space/จอปัจจุบัน
#     โบนัส: ได้ Web Speech engine ใหม่ทุกครั้ง = กันอาการ Chromium engine ตายเงียบสะสม (HANDOFF ข้อ 7)
PROFILE="$HOME/.stt-dictate/chrome-profile"
URL="http://127.0.0.1:8917/dictation-pad.html"
LOCK="/tmp/dictation-pad-launch.lock"

# กันกดรัวพร้อมกัน (สอง instance ชนกัน → หน้าต่างซ้อน): ให้เฉพาะรอบล่าสุดที่ล็อกได้เท่านั้นที่รัน
if ! mkdir "$LOCK" 2>/dev/null; then
  # lock ค้างเกิน 5 วิ (รอบก่อนโดน kill) → ล้างแล้วรันต่อเลย ไม่ใช่เงียบหาย
  [ -z "$(find "$LOCK" -maxdepth 0 -newermt '-5 seconds' 2>/dev/null)" ] && rmdir "$LOCK" && mkdir "$LOCK" 2>/dev/null || exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# 1) ปิด pad เก่า — จับผิดด้วย --user-data-dir เฉพาะของ pad เท่านั้น (ไม่แตะ Chrome หลัก / flow-chrome)
pkill -f -- "--user-data-dir=$PROFILE" 2>/dev/null
# รอจน pad เก่าตายจริง — ถ้ายังไม่ตาย open ใหม่จะส่งต่อไปให้ตัวที่กำลังปิด แล้วไม่มีหน้าต่างขึ้น
for i in $(seq 1 30); do pgrep -f -- "--user-data-dir=$PROFILE" >/dev/null || break; sleep 0.1; done
pkill -9 -f -- "--user-data-dir=$PROFILE" 2>/dev/null && sleep 0.3
rm -f "$PROFILE"/Singleton{Lock,Socket,Cookie}   # ตัวเก่าตายแล้ว lock ที่เหลือคือของค้าง

# 2) เปิดหน้าต่างใหม่ — โปรไฟล์เดียว (Default) ใน user-data-dir ของตัวเอง = ไม่มี profile picker ไม่มี first-run
open -na "Google Chrome" --args \
  --user-data-dir="$PROFILE" \
  --profile-directory=Default \
  --no-first-run --no-default-browser-check \
  --window-size=440,150 \
  --app="$URL"

# 3) รอหน้าต่างขึ้นแล้วให้ server ดึงขึ้นหน้า + ยึด keyboard focus (server ผ่าน launchd มีสิทธิ์ System Events แล้ว)
for i in 1 2 3 4 5 6; do
  sleep 0.5
  curl -s -m 3 "http://127.0.0.1:8917/focus" 2>/dev/null | grep -q '"focused"' && break
done
