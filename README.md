# BetAnalytics Fixed

Repo pregătit pentru GitHub Pages + GitHub Actions.

## Ce este în repo
- aplicația statică din rădăcina repo-ului
- workflow-ul `.github/workflows/fetch-bsd-data.yml`
- fișierul `data/latest.json` pe care îl citește aplicația

## Pas obligatoriu
Adaugă în repo secretul:
- `BSD_API_TOKEN` = tokenul tău BSD

## Cum pornești
1. intră în `Settings` → `Secrets and variables` → `Actions`
2. creează secretul `BSD_API_TOKEN`
3. mergi în `Actions`
4. rulează workflow-ul `Fetch BSD data`
5. după ce termină, deschide GitHub Pages și vei vedea datele

Arhiva completă reparată o păstrezi separat local sau o poți urca ulterior în repo.
