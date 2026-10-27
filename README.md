# LC CRM

O'quv markazlar uchun online CRM (MVP). Bitta tizimda ko'p o'quv markaz ishlaydi — har bir markazning ma'lumotlari bir-biridan to'liq ajratilgan.

**Texnologiyalar:** Node.js · Express · TypeScript · SQLite · React · TypeScript · Tailwind CSS · Vite  
**Docker kerak emas** — oddiy Node.js yetarli.

## Rollar va imkoniyatlar

| Rol | Nima qila oladi |
|---|---|
| **Super admin** | O'quv markazlarni yaratish/bloklash, har bir markaz administratorini yaratish va parolini tiklash |
| **Admin** | O'z markazida hamma narsa: o'qituvchi, o'quvchi, ota-onalar, guruhlar, dars jadvali, davomat, to'lovlar, qarzdorlar |
| **O'qituvchi** | O'z guruhlari, dars jadvali, o'quvchilar ro'yxati, davomat belgilash |
| **Yordamchi o'qituvchi** | O'qituvchi bilan bir xil huquq (faqat unga biriktirilgan guruhlarda) |
| **O'quvchi** | O'z jadvali, davomati, to'lov tarixi va qarzi |
| **Ota-ona** | Farzandlarining jadvali, davomati, to'lov tarixi va qarzi (bir nechta farzand bo'lsa — almashtirib ko'radi) |

Asosiy funksiyalar: login/parol bilan kirish · o'quvchi va ota-ona ma'lumotlari (ota-ona ↔ o'quvchi bog'lanishi) · guruhlar va haftalik dars jadvali (o'qituvchi/xona vaqt to'qnashuvi tekshiriladi) · davomat (keldi / kechikdi / kelmadi / sababli) va oylik hisobot · to'lovlar (naqd/karta/o'tkazma), oylik qarz hisobi, qarzdorlar ro'yxati · rolga mos bosh sahifa · telefon va kompyuterda qulay ko'rinish.

## Ishga tushirish

Kerak: **Node.js 20 yoki 22** (LTS).

```bash
npm install                          # bog'liqliklarni o'rnatish (ildiz papkada)
cp backend/.env.example backend/.env # sozlamalar (dev uchun bo'sh qoldirsa ham bo'ladi)
npm run seed                         # (ixtiyoriy) demo ma'lumotlar
npm run dev                          # backend :4000 + frontend :5173
```

Brauzerda **http://localhost:5173** ni oching.

### Demo kirish ma'lumotlari

`npm run seed` dan keyin (barcha demo foydalanuvchilar paroli: `Demo12345`):

| Rol | Login |
|---|---|
| Super admin | `superadmin` / `Admin12345` (`.env` dagi `SUPER_ADMIN_*`) |
| Admin | `demo_admin` |
| O'qituvchi | `demo_teacher`, `demo_teacher2` |
| Yordamchi o'qituvchi | `demo_support` |
| O'quvchi | `demo_student` … `demo_student6` |
| Ota-ona | `demo_parent`, `demo_parent2` |

> Demo foydalanuvchilarni haqiqiy ishda ishlatmang — seed faqat sinash uchun.

### Production (Dockersiz)

```bash
npm install
npm run build        # backend (dist) va frontend (frontend/dist) qurish
```

`backend/.env` ga **JWT_SECRET** va **SUPER_ADMIN_PASSWORD** ni albatta yozing, so'ng:

```bash
NODE_ENV=production npm start     # hammasi bitta portda (:4000): API + sayt
```

Server `frontend/dist` ni o'zi xizmat qiladi, alohida web-server shart emas. VPS da odatda `pm2` (jarayonni doim ishlatib turish) va `nginx` + HTTPS (Let's Encrypt) orqali ochiladi. `nginx` orqasida ishlasa `X-Forwarded-*` sarlavhalari qo'llab-quvvatlanadi.

**Zaxira nusxa:** hamma ma'lumot bitta faylda — `backend/data/lc_crm.db` (yoki `DB_PATH`). Serverni to'xtatib shu faylni (va `-wal`, `-shm` fayllarini) nusxalash yetarli.

## Testlar

```bash
npm test             # backend: 59 ta test (huquqlar, markazlararo izolyatsiya, davomat, to'lov, qarz, sozlamalar …)
npm run typecheck    # backend + frontend tiplarini tekshirish
```

## Hisob-kitob qoidasi (qarz qanday hisoblanadi)

- O'quvchi oyning istalgan kunida guruhda bo'lsa, o'sha oy uchun guruhning **to'liq oylik narxi** hisoblanadi.
- To'lov kiritilganda **qaysi oy uchun** ekani tanlanadi; qarz = shu oy uchun kerakli summa − shu oy uchun to'langan summa.
- Guruhdan chiqarilgan/bloklangan o'quvchiga keyingi oylar uchun qarz yozilmaydi.
- Guruhga o'quvchini qo'shishda **qo'shilgan sanani** o'zgartirish mumkin (davomat va qarz shu sanadan boshlanadi).

## Loyiha tuzilmasi

```
backend/
  src/
    app.ts            Express ilovasi, xatolar, frontendni xizmat qilish
    db.ts             SQLite sxemasi
    http.ts           Autentifikatsiya, rol tekshiruvi, validatsiya yordamchilari
    access.ts         Guruh/o'quvchiga kirish huquqlari
    billing.ts        Qarz hisobi
    routes/           auth, centers, users, groups(+schedule), attendance, payments, students, dashboard
    seed.ts           Demo ma'lumotlar
  tests/api.test.ts
frontend/
  src/
    pages/            Dashboard, Users, Groups, GroupDetail, Schedule, Attendance, Payments, StudentProfile, Centers …
    ui.tsx            Umumiy komponentlar (tugma, modal, forma …)
```

## Cheklovlar va keyingi qadamlar

MVP bo'lgani uchun quyidagilar hali yo'q: SMS/Telegram eslatmalar, fayl yuklash (rasm/hujjat), to'lov tizimlari (Payme/Click) bilan ulanish, eksport (Excel/PDF), o'quvchi yo'qlama uchun QR/Face ID, baholar va uy vazifalari, parolni "unutdim" orqali tiklash (hozir admin tiklaydi), ikki bosqichli autentifikatsiya. Token brauzerning `localStorage` ida saqlanadi. Katta yuklama (yuzlab markaz) bo'lsa SQLite o'rniga PostgreSQL ga o'tish kerak bo'ladi.
