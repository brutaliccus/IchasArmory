# Manual Talent Extraction - Quick Guide

## For Each Class (8 classes total):

### Step 1: Open Browser & Extract
1. Open: https://talents.turtlecraft.gg/druid (replace with class)
2. Press **F12** → **Console** tab
3. Copy/paste contents of `scrape_talents.js`
4. Press **Enter**
5. JSON is automatically copied to clipboard

### Step 2: Save Raw Data
1. Create file: `extracted_data/<classname>_talents_raw.json`
2. Paste clipboard contents
3. Save

### Step 3: Position Talents
1. Open: `talent_position_mapper.html` in browser
2. It should automatically load the raw JSON (if in same folder)
3. Drag talents to match grid on TurtleCraft
4. Click "Add Connections" and link prerequisites
5. Click "Export Positions"
6. Save as: `extracted_data/<classname>_talents_positioned.json`

## Classes to Extract (in priority order):

- [ ] Druid
- [ ] Warrior
- [ ] Paladin
- [ ] Rogue
- [ ] Mage
- [ ] Warlock
- [ ] Priest
- [ ] Hunter

## Files Needed Per Class:

```
extracted_data/
├── druid_talents_raw.json          (from browser console)
└── druid_talents_positioned.json   (from mapper tool)
```

## Then I Will:
- Convert positioned JSON to module format
- Add to modules/<classname>_talents.js
- Update talents_new.js imports
- Test in app

---

**Current Status:** HTML files downloaded, ready for manual extraction with browser console script.
