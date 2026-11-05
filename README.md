# Pitchside

Premier League intelligence platform. Work in progress, see `docs/data-sources.md`.

```bash
cd backend
pip install -r requirements-dev.txt
python -m scripts.ingest
uvicorn app.main:app --reload
```
