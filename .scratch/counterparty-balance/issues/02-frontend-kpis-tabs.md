# T2: Frontend KPI Summary Cards & 4-Way Quick Balance Filter Tabs

## Parent
#124

## What to build
Build and verify the 4 dynamic KPI Summary Widgets and 4-way Quick Balance Filter Tabs on the Counterparties page (`/counterparties`).
- 4 Top KPI Cards:
  - 1. Mijozlar: total customers count
  - 2. Yetkazib beruvchilar: total suppliers count
  - 3. Bizga qarzdorlar (Haqdorlik / Debitorlar): count and `+ {formatCurrency(total_amount)}` in bold emerald green (`#10b981` / `#059669`)
  - 4. Bizning qarzimiz (Qarzdorlik / Kreditorlar): count and `- {formatCurrency(total_amount)}` in bold crimson red (`#ef4444` / `#dc2626`)
- 4 Quick-Filter Tabs with counter badges:
  - Barcha kontragentlar
  - Faqat bizga qarzdorlar (Haqdorlik)
  - Faqat bizning qarzimiz (Kreditorlik)
  - Hisob-kitob qilinganlar (Balans = 0)
- Seamless coordination between folder sidebar navigation, search bar, and balance filter tabs.
- Full localization in Uzbek and Russian (`uz`/`ru`).

## Acceptance criteria
- [ ] Top 4 KPI summary cards render live counts and amounts from `getSummary`
- [ ] Positive receivables display `+` in green, payables display `-` in red
- [ ] Clicking each balance filter tab updates the table to display only matching counterparties
- [ ] Counter badges on tabs reflect active summary counts
- [ ] Search and folder filters work concurrently with active balance filter tab

## Blocked by
- #125 (Ticket 1)
