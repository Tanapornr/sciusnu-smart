# Signature fix + "re-sign" feature (nothing deployed, prod untouched)

## Root cause of missing signatures
Signature PNG too big on phones -> encrypted hex > Sheets 50,000-char cell limit -> Apps Script wrote
status+note, then failed on signature, so time/signature stayed empty.

## Fix (prevents new cases)
- SignaturePad.tsx: downscale to max 400px wide
- petitions.js: reject oversized signature (413) before writing; status written LAST
- Code.gs (Apps Script, redeploy as new version): validate sizes before writing + lock

## Re-sign feature (repairs existing cases, nobody else signs again)
- POST /api/petitions/:id/resign  — the person whose step is "อนุมัติ" with an EMPTY signature
  signs again. Writes ONLY signature + time. status/current_step/final_result untouched,
  works even when petition is already เสร็จสิ้น. Refuses if a signature already exists.
- POST /api/petitions/:id/fix-chain-email — admin only, only for steps with no signature.
  Fixes typos like `thanatornn68@nu.acth` so that person can log in.
- PetitionDetailModal.tsx: amber "ลายเซ็นของคุณยังไม่ถูกบันทึก" panel for the affected user;
  admin sees a list of affected approvers with a "แก้อีเมล" button.

## For PET-6910-8963
1. Admin opens petition -> "แก้อีเมล" on student1 -> nu.ac.th (check the project sheet too).
2. student1 and student2 each open the petition and sign once (2 people, not 5).
3. PDF export then shows their signatures.

Deploy order: Apps Script (Code.gs) -> backend -> frontend. Not compiled/run here (no node_modules).
