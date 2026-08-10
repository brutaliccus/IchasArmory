# Directory Cleanup Summary - December 27, 2025

## Overview
Organized the project by moving development/testing files to the Testing directory, leaving only production files in the main directory.

## Main Directory - Production Files (12 files)

### Core Application Files
- `index.html` - Main application page
- `app.js` - Main application logic (1131 lines)
- `style.css` - Application styles
- `sw.js` - Service worker (v5)

### Server Files (Required for Production)
- `armory_proxy.py` - Armory API proxy server
- `server.py` - Web server
- `requirements.txt` - Python dependencies

### Configuration & Dependencies
- `package.json` - Node.js dependencies
- `package-lock.json` - Dependency lock file

### Documentation
- `CACHE_UPDATE.md` - Cache update instructions
- `REFACTOR_SUMMARY.md` - Code refactoring summary
- `CLEANUP_SUMMARY.md` - This file

## Files Moved to Testing/

### Talent Development Files (Testing/)
- `check_bloodlust.js`
- `check_rank_desc.js`
- `search_missing_talents.js`
- `update_talent_descriptions.js`
- `talent_update_output.txt`
- `TALENT_EXTRACTION_GUIDE.md`

### Deprecated/Backup Modules (Testing/old_modules/)
- `enchant_converter.py`
- `enchants.bak`
- `enchants_backup.js`
- `enchants_final.js`
- `enchants_scraped_output.js`
- `enchants_updated.js`
- `talents.js` (replaced by talents_new.js)

## Modules Directory - Production Files (16 files)

**Active Modules:**
1. `armory.js` - Armory integration (NEW - refactor)
2. `buffs.js` - Buff system
3. `buildManager.js` - Build import/export (NEW - refactor)
4. `calculator.js` - Stats calculations
5. `enchantEffectIds.js` - Enchant effect ID mappings
6. `enchants.js` - Enchant database
7. `enchantSpellIds.js` - Enchant spell ID mappings
8. `gear.js` - Gear management
9. `gearCompare.js` - Gear comparison
10. `itemLoader.js` - Lazy item loading
11. `modal.js` - Modal dialogs
12. `races.js` - Race data
13. `shaman_talents.js` - Shaman talent data
14. `stats.js` - Stat parsing
15. `talents_new.js` - Talent system
16. `tooltips.js` - Tooltip generation

## Benefits

1. **Cleaner Organization**
   - Main directory: 12 production files
   - Testing files properly grouped
   - Old/backup modules separated

2. **Clear Structure**
   - Server files in root (required for deployment)
   - Development utilities in Testing/
   - Production code easy to identify

3. **Improved Maintainability**
   - Clear production vs development separation
   - Easy to find specific files
   - Reduced root directory clutter (from 17 to 12 files)

## Deployment

### Required for Production:
```
/                      (root - 12 files)
/modules/              (16 production modules)
/assets/               (icons, images, data)
/data/                 (split item data)
```

### Optional for Development:
```
/Testing/              (development utilities)
/backup_pre_refactor_2025-12-27/  (pre-refactor backup)
```

## Server Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run the server (includes armory proxy)
python server.py
```

The server runs on port 8000, armory proxy on port 8001.
