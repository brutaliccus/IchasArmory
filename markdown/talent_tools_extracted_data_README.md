# Talent Position Mapper - Usage Guide

## Quick Start

1. **Start the HTTP server:**
   - Double-click `start_mapper.bat`
   - Or run: `python -m http.server 8080` in this directory

2. **Open the mapper:**
   - Navigate to: `http://localhost:8080/talent_position_mapper_all_classes.html`

3. **Position talents:**
   - Select a class from the dropdown
   - Drag talent icons from the left pool to the 4×7 grid
   - Match the layout from https://talents.turtlecraft.gg/
   - Talent icons are displayed to help verify correct positioning

4. **Add connections (prerequisites):**
   - Click "Add Connections" button
   - Click the prerequisite talent first (the one that must be learned first)
   - Then click the dependent talent
   - Repeat for all prerequisite relationships

5. **Export:**
   - Click "Export Positions" to download the positioned JSON file
   - File will be named: `{classname}_talents_positioned.json`

## Files

- `*_talents_raw.json` - Raw talent data extracted from TurtleCraft HTML
- `talent_position_mapper_all_classes.html` - Interactive positioning tool
- `start_mapper.bat` - Convenience script to start HTTP server

## Icon Display

The mapper now displays WoW talent icons using the Wowhead CDN:
- Icons appear in the left talent pool for easy identification
- Icons appear in the grid cells when talents are placed
- Icons help verify you've positioned the correct talent

## Notes

- The grid is 4 columns × 7 rows (matching WoW Classic talent trees)
- You can remove a placed talent by hovering over it and clicking the × button
- Connection mode lets you define talent prerequisites (e.g., "needs 5 points in X")
